// Rewrites seeded one-liners and public reviews with the varied pool in copy-pool.mjs, for a database
// seeded before that pool existed. Demo logins keep their own text.
// local: npx tsx --env-file=.env.local scripts/vary-copy.mts
// cloud: npx tsx --env-file=.env.local --env-file=.env.cloud scripts/vary-copy.mts
import { createClient } from "@supabase/supabase-js";
import { oneLinerFor, reviewFor } from "./copy-pool.mjs";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: people, error } = await db.from("profiles").select("id, interests, self_traits").eq("origin", "SEED").not("one_liner", "is", null);
if (error) throw error;
let liners = 0;
for (let i = 0; i < (people ?? []).length; i += 50) {
  await Promise.all(people!.slice(i, i + 50).map(async (p) => {
    const text = oneLinerFor(p.id, p.interests, p.self_traits);
    if (text && !(await db.from("profiles").update({ one_liner: text }).eq("id", p.id)).error) liners++;
  }));
}

const { data: reviews } = await db.from("feedbacks").select("application_id").not("review_text", "is", null);
let texts = 0;
for (let i = 0; i < (reviews ?? []).length; i += 50) {
  await Promise.all(reviews!.slice(i, i + 50).map(async (r) => {
    if (!(await db.from("feedbacks").update({ review_text: reviewFor(r.application_id) }).eq("application_id", r.application_id)).error) texts++;
  }));
}
console.log(`one-liners ${liners}, reviews ${texts}`);
