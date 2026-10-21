// Group chats for past tables. seed-history writes finished rounds straight into the tables, so it skips
// what the live flow does at confirmation (finalize_confirmed_table). This fills each past table's room the
// way it would have looked: confirmation notice, curation, food summary, policy, the day-before reminder,
// the start-time topics and ice-breaker, and a few messages between the people who came. Safe to re-run.
// local: npm run seed:rooms   cloud: npx tsx --env-file=.env.local --env-file=.env.cloud scripts/history-rooms.mts
import { createClient } from "@supabase/supabase-js";
import { POLICY_TEXT, buildCuration, buildFoodSummary } from "../src/lib/matching/finalize";
import { keyNumber } from "./copy-pool.mjs";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ok = <T,>(r: { data: T; error: { message: string } | null }, what: string) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const at = (base: string, minutes: number) => new Date(new Date(base).getTime() + minutes * 60000).toISOString();
const kstWhen = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${"일월화수목금토"[d.getUTCDay()]}) ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const BEFORE = ["저 지금 출발해요!", "조금 일찍 도착할 것 같아요", "5분 정도 늦을 것 같아요 ㅠ 먼저 시키셔도 돼요", "예약명 말하면 되는 거죠?", "도착했어요! 안쪽 자리예요", "주차는 근처 공영주차장이 편해요"];
const AFTER = ["오늘 정말 즐거웠어요 다들 조심히 들어가세요!", "추천해 주신 곳 꼭 가 볼게요", "다음에 또 우연히 만나요 :)", "덕분에 목요일이 즐거웠어요", "이야기 너무 재밌었어요 피드백 남겼어요!", "다들 감사했어요, 좋은 주말 보내세요"];

type Profile = { name: string; interests: string[]; self_traits: string[]; food_avoid: string[]; allergies: string[] };
const [codes, topics, icebreakers] = await Promise.all([
  db.from("code_values").select("code_group, code, label").in("code_group", ["INTEREST", "SELF_TRAIT"]),
  db.from("content_items").select("id, text").eq("kind", "TOPIC").eq("active", true).order("text"),
  db.from("content_items").select("id, text").eq("kind", "ICEBREAKER").eq("active", true).order("text"),
]);
const labels = new Map((codes.data ?? []).map((c) => [`${c.code_group}:${c.code}`, c.label]));

const rounds = ok(await db.from("rounds").select("id, start_at, end_at, event_date").eq("status", "DONE"), "rounds") as { id: string; start_at: string; end_at: string; event_date: string }[];
let made = 0;
for (const round of rounds) {
  const tables = ok(await db.from("dining_tables")
    .select("id, reservation_name, curation, food_summary, chat_rooms(id), venues(name, address), table_members(profile_id, application_id, left_at, profiles(name, interests, self_traits, food_avoid, allergies))")
    .eq("round_id", round.id).in("status", ["CONFIRMED", "DONE"]), "tables") as unknown as {
      id: string; reservation_name: string | null; curation: string | null; food_summary: string | null;
      chat_rooms: { id: string }[] | { id: string } | null; venues: { name: string; address: string } | null;
      table_members: { profile_id: string; application_id: string; left_at: string | null; profiles: Profile | Profile[] | null }[];
    }[];
  for (const t of tables) {
    if (one(t.chat_rooms)) continue;
    const members = t.table_members.filter((m) => !m.left_at).map((m) => ({ ...m, p: one(m.profiles)! })).filter((m) => m.p);
    const { data: came } = await db.from("applications").select("profile_id").in("id", members.map((m) => m.application_id)).eq("attendance_status", "ATTENDED");
    const attendees = members.filter((m) => (came ?? []).some((c) => c.profile_id === m.profile_id));
    const n = keyNumber(t.id);
    const confirmedAt = at(round.start_at, -3 * 24 * 60 - 60); // three days before, right after the 18:00 matching
    const remindAt = at(round.start_at, -25 * 60);              // 18:00 the day before

    const room = ok(await db.from("chat_rooms").insert({ table_id: t.id, created_at: confirmedAt }).select("id").single(), "room") as { id: string };
    const curation = t.curation ?? buildCuration(members.map((m) => m.p), labels);
    const food = t.food_summary ?? buildFoodSummary(members.map((m) => m.p));
    const venue = t.venues ? `${t.venues.name}(${t.venues.address})` : "안내된 식당";
    const reservation = t.reservation_name ? ` 예약명은 "${t.reservation_name}"이에요.` : "";
    const picks = (topics.data ?? []).length ? [0, 1, 2].map((k) => topics.data![(n + k * 7) % topics.data!.length]) : [];
    const ice = (icebreakers.data ?? [])[(n >>> 5) % Math.max(1, (icebreakers.data ?? []).length)];

    const rows: { room_id: string; sender_id: string | null; kind: string; body: string; dedupe_key: string | null; created_at: string }[] = [
      { room_id: room.id, sender_id: null, kind: "NOTICE", body: `식탁이 확정됐어요. ${kstWhen(round.start_at)}, ${venue}에서 만나요.${reservation} 10분 전까지 도착해 주세요.`, dedupe_key: `notice:${t.id}`, created_at: confirmedAt },
      { room_id: room.id, sender_id: null, kind: "CURATION", body: `${curation} 첫 만남이니 가볍게 인사부터 나눠 보세요.`, dedupe_key: `curation:${t.id}`, created_at: at(confirmedAt, 0.1) },
      { room_id: room.id, sender_id: null, kind: "SYSTEM", body: food, dedupe_key: `food:${t.id}`, created_at: at(confirmedAt, 0.2) },
      { room_id: room.id, sender_id: null, kind: "SYSTEM", body: POLICY_TEXT, dedupe_key: `policy:${t.id}`, created_at: at(confirmedAt, 0.3) },
      { room_id: room.id, sender_id: null, kind: "REMINDER", body: `내일 만나요! ${kstWhen(round.start_at)}, ${venue}에서 만나요.${reservation}\n도착하면 테이블 화면에서 체크인해 주세요. 못 오게 되면 미리 알려 주세요.`, dedupe_key: `reminder:${t.id}`, created_at: remindAt },
      ...picks.map((p, k) => ({ room_id: room.id, sender_id: null, kind: "TOPIC", body: `Q${k + 1}. ${p.text}`, dedupe_key: `topic:${t.id}:${p.id}`, created_at: at(round.start_at, k * 0.1) })),
      ...(ice ? [{ room_id: room.id, sender_id: null, kind: "ICEBREAKER", body: ice.text, dedupe_key: `topic:${t.id}:${ice.id}`, created_at: at(round.start_at, 0.4) }] : []),
    ];
    // A few words between the people who actually came: before arriving, and after dinner.
    attendees.slice(0, 2).forEach((m, k) => rows.push({ room_id: room.id, sender_id: m.profile_id, kind: "USER", body: BEFORE[(n + k) % BEFORE.length], dedupe_key: null, created_at: at(round.start_at, -35 + k * 20) }));
    attendees.slice(-3).forEach((m, k) => rows.push({ room_id: room.id, sender_id: m.profile_id, kind: "USER", body: AFTER[(n + k * 2) % AFTER.length], dedupe_key: null, created_at: at(round.end_at, 15 + k * 12) }));

    const inserted = ok(await db.from("chat_messages").insert(rows).select("id, kind, dedupe_key, created_at"), "messages") as { id: string; kind: string; dedupe_key: string | null; created_at: string }[];
    // The posted topics count as this table's contents; the delivery log keeps the original times.
    const contents = inserted.filter((m) => m.kind === "TOPIC" || m.kind === "ICEBREAKER").map((m) => ({ table_id: t.id, content_item_id: m.dedupe_key!.split(":")[2], posted_message_id: m.id }));
    if (contents.length) ok(await db.from("table_contents").upsert(contents, { onConflict: "table_id,content_item_id", ignoreDuplicates: true }), "contents");
    for (const m of inserted) await db.from("deliveries").update({ created_at: m.created_at, sent_at: m.created_at }).eq("chat_message_id", m.id);
    await db.from("chat_rooms").update({ closed_at: at(round.end_at, 3 * 24 * 60) }).eq("id", room.id);
    made++;
  }
}
console.log(`rooms filled for ${made} past tables`);
