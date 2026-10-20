// Reallocation after a confirmed table lost people before the event day (기능 명세서 F-33, 4.4).
// The database function after_headcount_drop reports NEEDS_REALLOC; this module then looks for
// other confirmed tables of the same round and region that can take the remaining people without
// breaking the hard rules (table size, age gap, blocked pairs). What cannot be placed gets a full
// refund option, a coupon and other dates (fail_shrunk_member). Each move is its own transaction.
import type { SupabaseClient } from "@supabase/supabase-js";
import { violations } from "./engine";
import { buildFoodSummary } from "./finalize";
import { loadSettings } from "./run";
import type { Candidate, Relation, RelationType } from "./types";

type Profile = { gender: "M" | "F"; birth_year: number; mbti: string; interests: string[]; self_traits: string[]; wanted_traits: string[]; food_avoid: string[]; allergies: string[] };
type MemberRow = {
  application_id: string; profile_id: string;
  applications: { attendance_status: string } | { attendance_status: string }[] | null;
  profiles: Profile | Profile[] | null;
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const ABSENT = ["CANCELED_EARLY", "CANCELED_LATE"];

const toCandidate = (m: MemberRow): Candidate => {
  const p = one(m.profiles)!;
  return {
    applicationId: m.application_id, profileId: m.profile_id, gender: p.gender, birthYear: p.birth_year, mbti: p.mbti,
    interests: p.interests ?? [], selfTraits: p.self_traits ?? [], wantedTraits: p.wanted_traits ?? [], regions: [], hasLaterRound: false,
  };
};

const must = <T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
};

export type ShrinkResult = { moved: number; failed: number };

export async function reallocateShrunkTable(db: SupabaseClient, tableId: string): Promise<ShrinkResult> {
  const settings = await loadSettings(db);
  const table = must(await db.from("dining_tables").select("id, round_id, region_code, status").eq("id", tableId).single(), "table");
  if (table.status !== "CONFIRMED") return { moved: 0, failed: 0 };

  const select = "application_id, profile_id, applications(attendance_status), profiles(gender, birth_year, mbti, interests, self_traits, wanted_traits, food_avoid, allergies)";
  const active = (rows: MemberRow[]) => rows.filter((m) => !ABSENT.includes(one(m.applications)?.attendance_status ?? ""));

  const mine = active(must(await db.from("table_members").select(select).eq("table_id", tableId).is("left_at", null), "members") as unknown as MemberRow[]);
  if (mine.length >= settings.tableMin) return { moved: 0, failed: 0 };

  const others = must(
    await db.from("dining_tables").select("id").eq("round_id", table.round_id).eq("region_code", table.region_code).eq("status", "CONFIRMED").neq("id", tableId),
    "other tables",
  );
  const targets = [] as { id: string; cap: number; members: MemberRow[] }[];
  for (const o of others) {
    const members = active(must(await db.from("table_members").select(select).eq("table_id", o.id).is("left_at", null), "target members") as unknown as MemberRow[]);
    const { data: slot } = await db.from("dining_tables").select("venue_id").eq("id", o.id).single();
    const { data: seats } = slot?.venue_id
      ? await db.from("venue_availability").select("max_seats").eq("venue_id", slot.venue_id).eq("round_id", table.round_id).maybeSingle()
      : { data: null };
    targets.push({ id: o.id, cap: Math.min(settings.tableMax, seats?.max_seats ?? settings.tableMax), members });
  }

  const profileIds = [...new Set([...mine, ...targets.flatMap((t) => t.members)].map((m) => m.profile_id))];
  const relationRows = profileIds.length
    ? must(await db.from("relations").select("from_profile_id, to_profile_id, type").in("from_profile_id", profileIds).in("to_profile_id", profileIds), "relations")
    : [];
  const relations: Relation[] = relationRows.map((r) => ({ from: r.from_profile_id, to: r.to_profile_id, type: r.type as RelationType }));

  const fits = (target: { cap: number; members: MemberRow[] }, group: MemberRow[]) =>
    target.members.length + group.length <= target.cap &&
    violations([...target.members, ...group].map(toCandidate), relations, settings).length === 0;

  const placed = new Map<string, string>(); // application -> target table
  const smallestFirst = () => [...targets].sort((a, b) => a.members.length - b.members.length);

  // Keep the group together when one table can take everyone; otherwise place people one by one.
  const together = smallestFirst().find((t) => fits(t, mine));
  if (together) {
    for (const m of mine) placed.set(m.application_id, together.id);
    together.members.push(...mine);
  } else {
    for (const m of mine) {
      const target = smallestFirst().find((t) => fits(t, [m]));
      if (!target) continue;
      placed.set(m.application_id, target.id);
      target.members.push(m);
    }
  }

  let moved = 0;
  let failed = 0;
  for (const m of mine) {
    const to = placed.get(m.application_id);
    if (to) {
      const { error } = await db.rpc("move_member_to_table", { p_app: m.application_id, p_to: to });
      if (!error) { moved += 1; continue; }
    }
    const { error } = await db.rpc("fail_shrunk_member", { p_app: m.application_id });
    if (error) throw new Error(`fail_shrunk_member: ${error.message}`);
    failed += 1;
  }

  // New people at a table change its food conditions: tell the table again, without names.
  for (const target of targets.filter((t) => [...placed.values()].includes(t.id))) {
    const { data: room } = await db.from("chat_rooms").select("id").eq("table_id", target.id).maybeSingle();
    if (!room) continue;
    const profiles = target.members.map((m) => one(m.profiles)!).filter(Boolean);
    await db.from("chat_messages").upsert(
      { room_id: room.id, sender_id: null, kind: "SYSTEM", body: `인원 조정 후 ${buildFoodSummary(profiles)}`, dedupe_key: `food:${target.id}:${target.members.length}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  }

  const { error } = await db.rpc("close_table", {
    p_table: tableId,
    p_note: "함께하는 분이 줄어 이 식탁은 닫혔어요. 남은 분들은 다른 식탁으로 옮기거나 환불 안내를 받았어요.",
  });
  if (error) throw new Error(`close_table: ${error.message}`);
  return { moved, failed };
}

// Safety net for the scheduler: a table left under the minimum (for example after a crash) is handled again.
export async function sweepShrunkTables(db: SupabaseClient) {
  const { data, error } = await db.rpc("shrunk_tables");
  if (error) throw new Error(`shrunk_tables: ${error.message}`);
  const results: { table: string; moved: number; failed: number }[] = [];
  for (const id of (data ?? []) as string[]) results.push({ table: id, ...(await reallocateShrunkTable(db, id)) });
  return results;
}
