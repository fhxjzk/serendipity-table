import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// What one member may see about their confirmed table (F-36, F-38): table mates are
// limited to display name, age band, MBTI, interests and one-liner.

export function ageBand(birthYear: number, year = new Date().getFullYear()) {
  const age = year - birthYear;
  const part = age % 10 < 4 ? "초반" : age % 10 < 7 ? "중반" : "후반";
  return `${Math.floor(age / 10) * 10}대 ${part}`;
}

export type TableMate = { profileId: string; name: string; ageBand: string; mbti: string; interests: string[]; oneLiner: string | null; isMe: boolean };

export async function loadTableForMember(profileId: string, opts: { applicationId?: string; roomId?: string }) {
  const db = createAdminClient();
  let tableId: string | null = null;

  if (opts.applicationId) {
    const { data } = await db.from("applications").select("table_id, match_status").eq("id", opts.applicationId).eq("profile_id", profileId).maybeSingle();
    if (!data || data.match_status !== "CONFIRMED") return null;
    tableId = data.table_id;
  } else if (opts.roomId) {
    const { data } = await db.from("chat_rooms").select("table_id").eq("id", opts.roomId).maybeSingle();
    tableId = data?.table_id ?? null;
  }
  if (!tableId) return null;

  const [{ data: table }, { data: members }, { data: room }, { data: codes }] = await Promise.all([
    db.from("dining_tables")
      .select("id, region_code, reservation_name, curation, food_summary, venues(name, address, map_url, price_range), rounds(start_at, end_at, event_date, status, setting_overrides)")
      .eq("id", tableId).single(),
    db.from("table_members").select("profile_id, application_id, applications(attendance_status, checked_in_at), profiles(display_name, birth_year, mbti, interests, one_liner)").eq("table_id", tableId).is("left_at", null),
    db.from("chat_rooms").select("id").eq("table_id", tableId).maybeSingle(),
    db.from("code_values").select("code_group, code, label").in("code_group", ["INTEREST", "PRICE_RANGE"]),
  ]);
  if (!table || !(members ?? []).some((m) => m.profile_id === profileId)) return null;

  const label = (g: string, c: string) => codes?.find((x) => x.code_group === g && x.code === c)?.label ?? c;
  type P = { display_name: string; birth_year: number; mbti: string; interests: string[]; one_liner: string | null };
  const mates: TableMate[] = (members ?? []).map((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as P;
    return {
      profileId: m.profile_id, name: p.display_name, ageBand: ageBand(p.birth_year), mbti: p.mbti,
      interests: p.interests.map((c) => label("INTEREST", c)), oneLiner: p.one_liner, isMe: m.profile_id === profileId,
    };
  }).sort((a, b) => Number(b.isMe) - Number(a.isMe));

  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  const venue = one(table.venues as unknown as { name: string; address: string; map_url: string | null; price_range: string | null } | null);
  const round = one(table.rounds as unknown as { start_at: string; end_at: string; event_date: string; status: string; setting_overrides: Record<string, unknown> | null } | null)!;
  const mine = (members ?? []).find((m) => m.profile_id === profileId);
  const myApp = one(mine?.applications as unknown as { attendance_status: string; checked_in_at: string | null } | null);
  const nowMs = new Date().getTime();
  // Check-in opens 30 minutes before the start, or when the operator opens it for a demo (F-46, F-76).
  const checkInOpen = round.status !== "DONE" && (round.setting_overrides?.event_started === true || nowMs >= new Date(round.start_at).getTime() - 30 * 60000);
  return {
    tableId, roomId: room?.id ?? null, regionCode: table.region_code, reservationName: table.reservation_name,
    curation: table.curation, foodSummary: table.food_summary, round, mates,
    myApplicationId: mine?.application_id ?? null,
    myAttendance: myApp?.attendance_status ?? "SCHEDULED",
    eventEnded: round.status === "DONE",
    checkInOpen,
    venue: venue && { ...venue, priceLabel: venue.price_range ? label("PRICE_RANGE", venue.price_range) : null },
  };
}
