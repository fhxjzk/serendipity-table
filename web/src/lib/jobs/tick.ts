// Runs every job that is due. Called each minute by pg_cron through /api/jobs/tick.
// Each job is recorded in job_runs under a stable key, so a repeated tick skips it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { runRoundMatching } from "@/lib/matching/run";
import { sweepShrunkTables } from "@/lib/matching/shrink";
import { sendDueDeliveries } from "@/lib/delivery/send";

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

  // Day-before reminder (F-43), topics at the start time (F-44) and event end (F-53), once per round, in that order.
  const steps = [
    { prefix: "reminder", type: "REMINDER", column: "reminder_at", fn: "post_round_reminder" },
    { prefix: "start", type: "EVENT_START", column: "start_at", fn: "post_table_contents" },
    { prefix: "end", type: "EVENT_END", column: "end_at", fn: "end_round_event" },
  ] as const;
  for (const step of steps) {
    const { data: rounds } = await db.from("rounds").select("id, setting_overrides").eq("status", "MATCHED").lte(step.column, nowIso);
    for (const round of rounds ?? []) {
      // A paused round (demo, or an operator holding it) moves only when someone presses the step button.
      if (round.setting_overrides?.auto_match === false) continue;
      const jobKey = `${step.prefix}:${round.id}`;
      const claim = await db.from("job_runs").insert({ job_key: jobKey, job_type: step.type, round_id: round.id, trigger: "SCHEDULER" });
      if (claim.error) continue;
      const { data, error: e } = await db.rpc(step.fn, { p_round: round.id });
      await db.from("job_runs").update({ status: e ? "FAILED" : "DONE", result: e ? { error: e.message } : { value: data }, finished_at: new Date().toISOString() }).eq("job_key", jobKey);
      results.push({ job: jobKey, status: e ? "FAILED" : "DONE", detail: e?.message ?? data });
    }
  }
  // Tables left under the minimum before the event day are reallocated (F-33); normally the cancel
  // action already did it, this catches a crash in between.
  const shrunk = await sweepShrunkTables(db);
  for (const s of shrunk) results.push({ job: `shrink:${s.table}`, status: "DONE", detail: s });
  // One feedback reminder for anyone still silent after the set hours (F-50).
  const { data: reminded } = await db.rpc("send_feedback_reminders");
  if (reminded) results.push({ job: "feedback-remind", status: "DONE", detail: reminded });
  // No-show candidates past the objection window (F-55).
  const { data: confirmed } = await db.rpc("confirm_noshows", { p_round: null, p_force: false });
  if (confirmed) results.push({ job: "confirm-noshows", status: "DONE", detail: confirmed });
  // Tables still without a venue get another try (R-24, F-45).
  const { data: venues } = await db.rpc("retry_venue_assignment");
  if (venues) results.push({ job: "venue-retry", status: "DONE", detail: venues });
  // Last, so the notifications created above go out in the same tick (F-40, F-41, F-45).
  try {
    const sent = await sendDueDeliveries(db);
    if (sent.sent + sent.skipped + sent.retry + sent.failed > 0) results.push({ job: "deliveries", status: "DONE", detail: sent });
  } catch (e) {
    results.push({ job: "deliveries", status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
  }
  return results;
}
