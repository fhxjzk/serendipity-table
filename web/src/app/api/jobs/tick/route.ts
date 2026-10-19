import { createAdminClient } from "@/lib/supabase/admin";
import { runDueJobs } from "@/lib/jobs/tick";

export const maxDuration = 60;

// pg_cron calls this every minute with the shared secret (private.job_config).
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runDueJobs(createAdminClient());
  return Response.json({ ranAt: new Date().toISOString(), results });
}
