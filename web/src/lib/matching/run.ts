// Loads one round from the DB, runs the engine and saves the result through
// apply_match_run (one transaction, idempotent per run_key). Callers pass a
// service-role client: the scheduler route, the operator's instant run, or scripts/match.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALGORITHM_VERSION, runMatching } from "./engine";
import { finalizeRound } from "./finalize";
import type { Candidate, MatchResult, MatchSettings, Relation, RelationType } from "./types";

export type MatchTrigger = "SCHEDULER" | "DEMO";

const must = <T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
};

export async function loadSettings(db: SupabaseClient): Promise<MatchSettings> {
  const { data, error } = await db.from("app_settings").select("key, value").in("key", ["match_weights", "min_match_score", "table_size", "max_age_gap"]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return {
    weights: v.match_weights,
    minScore: Number(v.min_match_score),
    tableMin: v.table_size.min,
    tableMax: v.table_size.max,
    maxAgeGap: Number(v.max_age_gap),
  };
}

// Paid, active applications of the round as engine candidates, their relations, and later open rounds.
async function loadRoundInput(db: SupabaseClient, round: { id: string; event_date: string }) {
  const roundId = round.id;
  const settings = await loadSettings(db);

  const choiceRows = must(
    await db.from("application_choices").select("application_id, region_code").eq("round_id", roundId),
    "choices",
  );
  const appIds = [...new Set(choiceRows.map((c) => c.application_id))];
  const apps = appIds.length
    ? must(
        await db.from("applications")
          .select("id, profile_id, profiles(gender, birth_year, mbti, interests, self_traits, wanted_traits, restriction, restricted_until)")
          .in("id", appIds).eq("is_active", true).eq("application_status", "SUBMITTED").eq("payment_status", "PAID")
          .in("match_status", ["WAITING", "MATCHING", "REALLOCATING"]),
        "applications",
      )
    : [];

  // Later open rounds, for "wait for your other date" and alternative offers.
  const laterRounds = must(
    await db.from("rounds").select("id, event_date, apply_deadline_at").eq("status", "OPEN").gt("event_date", round.event_date).order("event_date"),
    "later rounds",
  );
  const laterIds = laterRounds.map((r) => r.id);
  const laterChoices = apps.length && laterIds.length
    ? must(await db.from("application_choices").select("application_id, round_id").in("application_id", apps.map((a) => a.id)).in("round_id", laterIds), "later choices")
    : [];

  type ProfileRow = { gender: "M" | "F"; birth_year: number; mbti: string; interests: string[]; self_traits: string[]; wanted_traits: string[]; restriction: string; restricted_until: string | null };
  const candidates: Candidate[] = [];
  for (const a of apps) {
    const p = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as ProfileRow | null;
    if (!p) continue;
    const restricted = p.restriction === "BANNED" || (p.restriction === "RESTRICTED" && (!p.restricted_until || p.restricted_until >= round.event_date));
    if (restricted) continue;
    candidates.push({
      applicationId: a.id,
      profileId: a.profile_id,
      gender: p.gender,
      birthYear: p.birth_year,
      mbti: p.mbti,
      interests: p.interests ?? [],
      selfTraits: p.self_traits ?? [],
      wantedTraits: p.wanted_traits ?? [],
      regions: choiceRows.filter((c) => c.application_id === a.id && c.region_code !== "ETC").map((c) => c.region_code),
      hasLaterRound: laterChoices.some((c) => c.application_id === a.id),
    });
  }

  const profileIds = candidates.map((c) => c.profileId);
  const relationRows = profileIds.length
    ? must(await db.from("relations").select("from_profile_id, to_profile_id, type").in("from_profile_id", profileIds).in("to_profile_id", profileIds), "relations")
    : [];
  const relations: Relation[] = relationRows.map((r) => ({ from: r.from_profile_id, to: r.to_profile_id, type: r.type as RelationType }));
  return { settings, candidates, relations, laterRounds, laterChoices };
}

function statsOf(candidates: Candidate[], result: MatchResult) {
  const seated = result.tables.reduce((n, t) => n + t.members.length, 0);
  return {
    candidates: candidates.length,
    tables: result.tables.length,
    seated,
    failed: result.failures.filter((f) => !f.waitsForLaterRound).length,
    waiting: result.failures.filter((f) => f.waitsForLaterRound).length,
    success_rate: candidates.length ? Math.round((seated / candidates.length) * 1000) / 10 : 0,
    reallocated: result.events.filter((e) => e.type === "REALLOCATED").length,
    merged: new Set(result.events.filter((e) => e.type === "MERGED").map((e) => e.tableIndex)).size,
  };
}

export async function runRoundMatching(db: SupabaseClient, roundId: string, trigger: MatchTrigger) {
  const round = must(await db.from("rounds").select("id, event_date, status").eq("id", roundId).single(), "round");
  const runKey = `match:${roundId}`;
  if (round.status !== "OPEN") {
    const { data: prev } = await db.from("match_runs").select("id").eq("run_key", runKey).maybeSingle();
    if (round.status === "MATCHED") await finalizeRound(db, roundId);
    return { runId: (prev?.id as string | undefined) ?? null, alreadyApplied: true, stats: null };
  }

  const { settings, candidates, relations, laterRounds, laterChoices } = await loadRoundInput(db, round);
  const result = runMatching(candidates, relations, settings);

  // Alternative offers (5.2 ⑤): later open rounds still taking applications that the person did not choose, same regions.
  const nowIso = new Date().toISOString();
  const offersFor = (c: Candidate) => {
    const chosen = new Set(laterChoices.filter((x) => x.application_id === c.applicationId).map((x) => x.round_id));
    const out: { round_id: string; region_code: string; rank: number }[] = [];
    for (const r of laterRounds) {
      if (chosen.has(r.id) || r.apply_deadline_at <= nowIso) continue;
      for (const region of c.regions) out.push({ round_id: r.id, region_code: region, rank: out.length + 1 });
    }
    return out.slice(0, 6);
  };

  const stats = statsOf(candidates, result);

  const payload = {
    round_id: roundId,
    run_key: runKey,
    trigger,
    algorithm_version: ALGORITHM_VERSION,
    settings_snapshot: settings,
    stats,
    tables: result.tables.map((t) => ({
      region_code: t.regionCode,
      score: t.score.total,
      score_detail: t.score,
      members: t.members.map((m) => m.applicationId),
    })),
    failures: result.failures.map((f) => ({
      application_id: f.candidate.applicationId,
      reason: f.reason,
      waits: f.waitsForLaterRound,
      offers: f.waitsForLaterRound ? [] : offersFor(f.candidate),
    })),
    events: result.events.map((e) => ({
      application_id: e.applicationId,
      type: e.type,
      reason: e.reason,
      ...(e.tableIndex !== undefined ? { table_index: e.tableIndex } : {}),
      detail: { ...(e.detail ?? {}), ...(e.regionCode ? { region: e.regionCode } : {}) },
    })),
  };

  const applied = must(await db.rpc("apply_match_run", { p: payload }), "apply_match_run") as { run_id: string; already_applied: boolean };
  await finalizeRound(db, roundId);
  return { runId: applied.run_id, alreadyApplied: applied.already_applied, stats };
}

// F-62: the same candidates and engine as the real run, computed on the spot and never saved.
export async function previewRoundMatching(db: SupabaseClient, roundId: string) {
  const round = must(await db.from("rounds").select("id, event_date, status").eq("id", roundId).single(), "round");
  const { settings, candidates, relations } = await loadRoundInput(db, round);
  const result = runMatching(candidates, relations, settings);
  const ids = candidates.map((c) => c.profileId);
  const names = new Map<string, { name: string; gender: string; birth_year: number }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from("profiles").select("id, name, gender, birth_year").in("id", ids.slice(i, i + 100));
    for (const p of data ?? []) names.set(p.id, p);
  }
  return { settings, result, stats: statsOf(candidates, result), names };
}

export async function resetRoundMatching(db: SupabaseClient, roundId: string) {
  const { error } = await db.rpc("reset_round_matching", { p_round_id: roundId });
  if (error) throw new Error(`reset_round_matching: ${error.message}`);
}
