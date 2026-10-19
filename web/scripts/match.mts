// Runs (or resets) automatic matching for one round by date.
// Usage: npm run match -- 2026-10-22 [--reset]
import { createClient } from "@supabase/supabase-js";
import { resetRoundMatching, runRoundMatching } from "../src/lib/matching/run";

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("usage: npm run match -- YYYY-MM-DD [--reset]");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: round, error } = await db.from("rounds").select("id, title").eq("event_date", date).single();
if (error || !round) throw new Error(`no round on ${date}`);

if (process.argv.includes("--reset")) {
  await resetRoundMatching(db, round.id);
  console.log(`reset ${round.title}`);
} else {
  const result = await runRoundMatching(db, round.id, "DEMO");
  console.log(round.title, JSON.stringify(result));
}
