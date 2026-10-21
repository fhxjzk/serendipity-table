// A second login at the same table as SEED_TABLE_EMAIL, so live chat can be shown between two people
// (two windows, or a phone and a laptop). One seeded table mate gets SEED_TABLE2_EMAIL / SEED_TABLE2_PASSWORD.
// Run after the table account's round is matched — local: npx tsx --env-file=.env.local scripts/table-mate-account.mts
// cloud: npx tsx --env-file=.env.local --env-file=.env.cloud scripts/table-mate-account.mts
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = process.env.SEED_TABLE2_EMAIL;
const password = process.env.SEED_TABLE2_PASSWORD;
if (!email || !password) throw new Error("SEED_TABLE2_EMAIL / SEED_TABLE2_PASSWORD are not set");

const users: { id: string; email?: string }[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const host = users.find((u) => u.email === process.env.SEED_TABLE_EMAIL);
if (!host) throw new Error("table account not found");
const { data: app } = await db.from("applications").select("table_id").eq("profile_id", host.id).eq("is_active", true).eq("match_status", "CONFIRMED").maybeSingle();
if (!app?.table_id) throw new Error("table account has no confirmed table yet");

const { data: mates } = await db.from("table_members").select("profile_id, profiles!inner(name, origin)").eq("table_id", app.table_id).is("left_at", null);
const mateIds = new Set((mates ?? []).map((m) => m.profile_id));
const already = users.find((u) => u.email === email);
if (already && mateIds.has(already.id)) {
  await db.auth.admin.updateUserById(already.id, { password });
  console.log("already at the same table; password refreshed");
  process.exit(0);
}
// A seeded mate whose login is still the anonymous seedN address.
const seedLogin = new Map(users.filter((u) => /^seed\d+@usangtak\.test$/.test(u.email ?? "")).map((u) => [u.id, u]));
const pick = (mates ?? [])
  .map((m) => ({ id: m.profile_id, ...(Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { name: string; origin: string } }))
  .filter((m) => m.id !== host.id && m.origin === "SEED" && seedLogin.has(m.id))
  .sort((a, b) => a.name.localeCompare(b.name))[0];
if (!pick) throw new Error("no seeded mate with a login at that table");

// Moving the address: free it from a previous holder first (it may sit at another table after a re-match).
if (already) await db.auth.admin.updateUserById(already.id, { email: `seed-moved-${Date.now()}@usangtak.test` });
const { error } = await db.auth.admin.updateUserById(pick.id, { email, password, email_confirm: true });
if (error) throw error;
console.log(`table mate account attached to ${pick.name}`);
