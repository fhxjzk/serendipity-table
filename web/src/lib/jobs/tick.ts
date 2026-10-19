// Runs every job that is due. Called each minute by pg_cron through /api/jobs/tick.
// Each job is recorded in job_runs under a stable key, so a repeated tick skips it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { runRoundMatching } from "@/lib/matching/run";

export async function runDueJobs(db: SupabaseClient) {
  const nowIso = new Date().toISOString();
  // Unpaid applications past their deadline leave the pool before any matching runs (F-14).
  const { data: expired } = await db.rpc("expire_unpaid_applications", { p_profile: null });

  const { data: due, error } = await db
    .from("rounds")
    .select("id, title, setting_overrides")
    .eq("status", "OPEN")
    .lte("match_run_at", nowIso);
  if (error) throw error;

  const results: { job: string; status: string; detail?: unknown }[] = [];
  for (const round of due ?? []) {
    const jobKey = `match:${round.id}`;
    if (round.setting_overrides?.auto_match === false) {
      results.push({ job: jobKey, status: "PAUSED" });
      continue;
    }
    // Claim the job; a second tick that loses the insert race skips it.
    const claim = await db.from("job_runs").insert({ job_key: jobKey, job_type: "MATCH", round_id: round.id, trigger: "SCHEDULER" });
    if (claim.error) {
      results.push({ job: jobKey, status: "SKIPPED" });
      continue;
    }
    try {
      const result = await runRoundMatching(db, round.id, "SCHEDULER");
      await db.from("job_runs").update({ status: "DONE", result, finished_at: new Date().toISOString() }).eq("job_key", jobKey);
      results.push({ job: jobKey, status: "DONE", detail: result.stats });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("job_runs").update({ status: "FAILED", result: { error: message }, finished_at: new Date().toISOString() }).eq("job_key", jobKey);
      results.push({ job: jobKey, status: "FAILED", detail: message });
    }
  }
  if (expired) results.push({ job: "expire-unpaid", status: "DONE", detail: expired });
  return results;
}
