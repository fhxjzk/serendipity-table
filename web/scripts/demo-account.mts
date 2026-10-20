// A third demo login for judges to try applying (demo step 1): one seeded participant who came to an
// earlier dinner and has nothing in progress gets the SEED_NEW_EMAIL / SEED_NEW_PASSWORD login.
// Run after seed.mjs (and seed-history) — local: npm run demo:account
// cloud: npx tsx --env-file=.env.local --env-file=.env.cloud scripts/demo-account.mts
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = process.env.SEED_NEW_EMAIL;
const password = process.env.SEED_NEW_PASSWORD;
if (!email || !password) throw new Error("SEED_NEW_EMAIL / SEED_NEW_PASSWORD are not set");

const users: { id: string; email?: string }[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const already = users.find((u) => u.email === email);
if (already) {
  await db.auth.admin.updateUserById(already.id, { password });
  console.log("demo account already attached; password refreshed");
  process.exit(0);
}

// Seeded people who attended before and have no application in progress.
const { data: attended } = await db.from("applications").select("profile_id").eq("attendance_status", "ATTENDED");
const { data: active } = await db.from("applications").select("profile_id").eq("is_active", true);
const busy = new Set((active ?? []).map((a) => a.profile_id));
const ids = [...new Set((attended ?? []).map((a) => a.profile_id))].filter((id) => !busy.has(id));
const year = new Date().getFullYear();
const { data: candidates } = await db.from("profiles").select("id, name, birth_year").in("id", ids.slice(0, 300))
  .eq("origin", "SEED").eq("restriction", "NONE").gte("birth_year", year - 34).lte("birth_year", year - 25).order("name");
const seedLogin = new Set(users.filter((u) => /^seed\d+@usangtak\.test$/.test(u.email ?? "")).map((u) => u.id));
const pick = (candidates ?? []).find((p) => seedLogin.has(p.id));
if (!pick) throw new Error("no suitable seeded participant");

const { error } = await db.auth.admin.updateUserById(pick.id, { email, password, email_confirm: true });
if (error) throw error;
console.log(`demo account attached to ${pick.name}`);
