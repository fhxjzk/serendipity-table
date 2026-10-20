// Demo history (기능 명세서 F-74): runs the matching engine over every past round and records
// who sat where, who came, feedback, who met whom, a few blocks and reports. Run after seed.mjs:
//   npm run seed:history            (local)
// For the cloud database add the cloud env file after the local one:
//   npx tsx --env-file=.env.local --env-file=.env.cloud scripts/seed-history.mts
// Skipped when history already exists. Nobody who applied for an upcoming round gets a negative
// relation, so the upcoming demo rounds keep their expected results.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { ALGORITHM_VERSION, runMatching } from "../src/lib/matching/engine";
import { loadSettings } from "../src/lib/matching/run";
import type { Candidate, Relation } from "../src/lib/matching/types";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ok = <T,>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? []) as NonNullable<T>;
};
const insertAll = async (table: string, rows: object[]) => {
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 400));
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
};
const inChunks = async <T,>(ids: string[], fn: (chunk: string[]) => Promise<T[]>) => {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...(await fn(ids.slice(i, i + 100))));
  return out;
};

// Same numbers every run.
let state = 20261020;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const existing = ok(await db.from("match_runs").select("id").like("run_key", "hist:%").limit(1), "existing");
if (existing.length) {
  console.log("history already seeded, nothing to do");
  process.exit(0);
}

const settings = await loadSettings(db);
const rounds = ok(await db.from("rounds").select("id, event_date, start_at, match_run_at, title").eq("status", "DONE").order("event_date"), "rounds");
const venues = ok(await db.from("venues").select("id, region_code").order("name"), "venues");
const upcomingChoices = ok(
  await db.from("application_choices").select("applications(profile_id), rounds!inner(status)").in("rounds.status", ["OPEN", "MATCHED"]), "upcoming",
) as unknown as { applications: { profile_id: string } | { profile_id: string }[] | null }[];
const protectedIds = new Set(upcomingChoices.map((c) => (Array.isArray(c.applications) ? c.applications[0] : c.applications)?.profile_id).filter(Boolean) as string[]);

const REVIEWS = [
  "처음 보는 분들인데 대화가 끊기지 않았어요.", "식당 분위기가 좋아서 편하게 이야기했어요.", "혼자 먹기 아쉬운 날 딱 좋았어요.",
  "연령대가 비슷해서 이야기가 잘 통했어요.", "생각보다 훨씬 즐거운 저녁이었어요.", "다음에도 또 신청하고 싶어요.",
  "대화 주제 덕분에 어색하지 않게 시작했어요.", "새로운 사람을 만나는 부담이 적었어요.",
];
const REPORT_REASONS = ["RUDE", "HARASS", "ETC"];

type ProfileRow = { gender: "M" | "F"; birth_year: number; mbti: string; interests: string[]; self_traits: string[]; wanted_traits: string[] };
const relations: Relation[] = [];
const stats = { rounds: 0, tables: 0, seated: 0, attended: 0, noShow: 0, feedbacks: 0, reports: 0 };
let openReports = 0;
const settled = new Set<string>();

for (const round of rounds) {
  const choices = ok(await db.from("application_choices").select("application_id, region_code").eq("round_id", round.id), "choices");
  const appIds = [...new Set(choices.map((c) => c.application_id))];
  const apps = await inChunks(appIds, async (ids) =>
    ok(await db.from("applications").select("id, profile_id, profiles(gender, birth_year, mbti, interests, self_traits, wanted_traits)").in("id", ids).eq("payment_status", "PAID"), "apps"));

  // An application belongs to one table in total, so anyone already settled in an earlier round is skipped.
  const laterIds = rounds.filter((r) => r.event_date > round.event_date).map((r) => r.id);
  const laterChoices = appIds.length && laterIds.length
    ? await inChunks(appIds, async (ids) => ok(await db.from("application_choices").select("application_id").in("application_id", ids).in("round_id", laterIds), "later"))
    : [];
  const hasLater = new Set(laterChoices.map((c) => c.application_id));

  const candidates: Candidate[] = [];
  for (const a of apps) {
    const p = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as ProfileRow | null;
    if (!p || settled.has(a.id)) continue;
    candidates.push({
      applicationId: a.id, profileId: a.profile_id, gender: p.gender, birthYear: p.birth_year, mbti: p.mbti, interests: p.interests ?? [],
      selfTraits: p.self_traits ?? [], wantedTraits: p.wanted_traits ?? [], hasLaterRound: false,
      regions: choices.filter((c) => c.application_id === a.id && c.region_code !== "ETC").map((c) => c.region_code),
    });
  }
  if (!candidates.length) continue;
  const result = runMatching(candidates, relations, settings);

  const runId = randomUUID();
  const seated = result.tables.reduce((n, t) => n + t.members.length, 0);
  await insertAll("match_runs", [{
    id: runId, round_id: round.id, run_key: `hist:${round.id}`, trigger: "SCHEDULER", algorithm_version: ALGORITHM_VERSION, settings_snapshot: settings, status: "DONE",
    stats: { candidates: candidates.length, tables: result.tables.length, seated, failed: result.failures.length, success_rate: Math.round((seated / candidates.length) * 1000) / 10 },
    started_at: round.match_run_at, finished_at: round.match_run_at,
  }]);

  const tableRows: object[] = [];
  const memberRows: object[] = [];
  const appPatches: { id: string; patch: Record<string, unknown> }[] = [];
  const feedbackRows: object[] = [];
  const relationRows: object[] = [];
  const noshowRows: object[] = [];
  const reportRows: object[] = [];

  for (const t of result.tables) {
    const tableId = randomUUID();
    const venue = venues.find((v) => v.region_code === t.regionCode);
    tableRows.push({
      id: tableId, round_id: round.id, region_code: t.regionCode, match_run_id: runId, status: "DONE", score: t.score.total, score_detail: t.score,
      venue_id: venue?.id ?? null, reservation_name: `우연한식탁 ${tableId.slice(0, 4).toUpperCase()}`, confirmed_at: round.match_run_at,
    });
    const attended: Candidate[] = [];
    for (const m of t.members) {
      settled.add(m.applicationId);
      memberRows.push({ table_id: tableId, round_id: round.id, application_id: m.applicationId, profile_id: m.profileId, joined_at: round.match_run_at });
      const r = rand();
      const attendance = r < 0.86 ? "ATTENDED" : r < 0.93 ? "CANCELED_LATE" : "NO_SHOW";
      appPatches.push({ id: m.applicationId, patch: { table_id: tableId, match_status: "CONFIRMED", attendance_status: attendance, checked_in_at: attendance === "ATTENDED" ? round.start_at : null } });
      if (attendance === "ATTENDED") attended.push(m);
      if (attendance === "NO_SHOW") { noshowRows.push({ application_id: m.applicationId, table_id: tableId, result: "NO_SHOW", decided_at: round.start_at }); stats.noShow += 1; }
    }
    stats.attended += attended.length;

    for (const a of attended) {
      for (const b of attended) {
        if (a === b) continue;
        relationRows.push({ from_profile_id: a.profileId, to_profile_id: b.profileId, type: "MET", source_table_id: tableId });
        relations.push({ from: a.profileId, to: b.profileId, type: "MET" });
      }
      if (rand() < 0.8) {
        const score = () => 3 + (rand() < 0.5 ? 2 : rand() < 0.8 ? 1 : 0) - (rand() < 0.05 ? 1 : 0);
        const publicReview = rand() < 0.35;
        feedbackRows.push({
          application_id: a.applicationId, table_id: tableId, profile_id: a.profileId, mood_score: score(), talk_score: score(), venue_score: score(),
          rejoin_intent: score(), recommend_intent: score(), review_rating: publicReview ? score() : null, review_text: publicReview ? pick(REVIEWS) : null,
          review_public: publicReview, submitted_at: round.start_at,
        });
        stats.feedbacks += 1;
      }
      const others = attended.filter((o) => o !== a);
      if (others.length && rand() < 0.35) {
        const b = pick(others);
        relationRows.push({ from_profile_id: a.profileId, to_profile_id: b.profileId, type: "LIKE", source_table_id: tableId });
        relations.push({ from: a.profileId, to: b.profileId, type: "LIKE" });
      }
      const b = others.length ? pick(others) : null;
      if (b && !(protectedIds.has(a.profileId) && protectedIds.has(b.profileId))) {
        if (rand() < 0.03) {
          relationRows.push({ from_profile_id: a.profileId, to_profile_id: b.profileId, type: "DISLIKE", source_table_id: tableId });
          relations.push({ from: a.profileId, to: b.profileId, type: "DISLIKE" });
        } else if (rand() < 0.012) {
          relationRows.push(
            { from_profile_id: a.profileId, to_profile_id: b.profileId, type: "REPORT", source_table_id: tableId },
            { from_profile_id: a.profileId, to_profile_id: b.profileId, type: "BLOCK", source_table_id: tableId },
          );
          relations.push({ from: a.profileId, to: b.profileId, type: "REPORT" }, { from: a.profileId, to: b.profileId, type: "BLOCK" });
          const open = openReports < 2 && round.event_date >= "2026-10-01";
          if (open) openReports += 1;
          reportRows.push({
            reporter_id: a.profileId, reported_id: b.profileId, table_id: tableId, reason_code: pick(REPORT_REASONS),
            detail: "식사 중 불편한 이야기를 계속해서 대화가 어려웠어요.", status: open ? "OPEN" : "RESOLVED", action: open ? null : pick(["NONE", "WARNING"]),
            handled_at: open ? null : round.start_at,
          });
          stats.reports += 1;
        }
      }
    }
  }

  // People the engine could not seat: half chose a refund, the rest moved to another date or kept their ticket.
  const resolutionRows: object[] = [];
  const refundRows: object[] = [];
  const failedApps = result.failures.map((f) => f.candidate.applicationId).filter((id) => !hasLater.has(id));
  const payments = failedApps.length
    ? await inChunks(failedApps, async (ids) => ok(await db.from("payments").select("id, application_id, amount").in("application_id", ids).eq("status", "PAID"), "payments"))
    : [];
  for (const f of result.failures) {
    if (hasLater.has(f.candidate.applicationId)) continue; // still waits for its other date
    settled.add(f.candidate.applicationId);
    const choice = rand() < 0.5 ? "REFUND" : rand() < 0.6 ? "MOVE" : "KEEP";
    const pay = payments.find((p) => p.application_id === f.candidate.applicationId);
    const patch: Record<string, unknown> = { match_status: "ALTERNATIVE_OFFERED", reason_code: f.reason };
    if (choice === "REFUND" && pay) {
      const refundId = randomUUID();
      refundRows.push({ id: refundId, payment_id: pay.id, application_id: f.candidate.applicationId, amount: pay.amount, reason: "MATCH_FAILED", status: "REFUNDED", completed_at: round.match_run_at });
      resolutionRows.push({ application_id: f.candidate.applicationId, choice, refund_id: refundId });
      patch.payment_status = "REFUNDED";
    } else {
      resolutionRows.push({ application_id: f.candidate.applicationId, choice: choice === "REFUND" ? "KEEP" : choice });
    }
    appPatches.push({ id: f.candidate.applicationId, patch });
  }

  await insertAll("dining_tables", tableRows);
  await insertAll("table_members", memberRows);
  await insertAll("noshow_cases", noshowRows);
  await insertAll("feedbacks", feedbackRows);
  await insertAll("relations", relationRows);
  await insertAll("reports", reportRows);
  await insertAll("refunds", refundRows);
  await insertAll("match_resolutions", resolutionRows);
  for (let i = 0; i < appPatches.length; i += 25) {
    await Promise.all(appPatches.slice(i, i + 25).map(async ({ id, patch }) => {
      const { error } = await db.from("applications").update(patch).eq("id", id);
      if (error) throw new Error(`update application: ${error.message}`);
    }));
  }
  stats.rounds += 1;
  stats.tables += result.tables.length;
  stats.seated += seated;
  console.log(`${round.title}: ${result.tables.length} tables, ${seated}/${candidates.length} seated`);
}
console.log("done", JSON.stringify(stats));
