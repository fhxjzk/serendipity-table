// Seeds the 294 virtual applicants per 03.데이터 정의서 9장, plus test accounts.
//   - Raw dates become rounds: past Thursdays are DONE, 10/22 onward are OPEN.
//   - Each applicant gets one application with all chosen dates, a mock payment,
//     a ticket and ledger rows that follow the ticket rule (1회권 / 3·4회권 / 3회권 사용).
//   - Demo pool for 10/22: 8 past applicants re-apply (홍대, ages 25~31) next to the
//     2 original 10/22 applicants, who cannot form a table and end up refunded.
// Usage: npm run seed            (first run on an empty DB)
//        npm run seed -- --reset (deletes rounds/applications/payments and rebuilds)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 500) must(await db.from(table).insert(rows.slice(i, i + 500)), `insert ${table}`);
}

// Deterministic random so every run builds the same demo data.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261019);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const YEAR = 2026;
const REGIONS = ["HONGDAE", "GANGNAM", "EULJIRO", "JAMSIL"];
const PRICES = { SINGLE: 8000, PACK3: 15000, PACK4: 18000 };
const USES = { SINGLE: 1, PACK3: 3, PACK4: 4 };
const VALID_DAYS = 60;

const JOBS = [
  "마케터", "개발자", "디자이너", "간호사", "교사", "회계사", "공무원", "연구원", "PD", "기획자",
  "대학원생", "약사", "영업직", "인사담당자", "스타트업 대표", "물리치료사", "승무원", "변호사", "건축가", "프리랜서 작가",
];

// Re-applicants for 10/22 (1-based row in applicants.json, name checked at runtime).
const REAPPLY_1022 = [
  [258, "윤현우"], [275, "정건희"], [262, "정현진"], [257, "박상현"],
  [255, "정혜진"], [277, "김정은"], [279, "조유리"], [271, "윤주연"],
];
// A few demo allergies for the table summary (data definition 9.2).
const DEMO_ALLERGIES = { 255: ["갑각류"], 277: ["견과류"], 292: ["갑각류"] };
// Virtual applicants that get a real login for the demo (credentials from .env.local):
// 255 is seated at a 10/22 table (confirmed detail + chat), 292 cannot be matched (failure resolution).
const DEMO_LOGINS = {
  255: ["SEED_TABLE_EMAIL", "SEED_TABLE_PASSWORD"],
  292: ["SEED_FAIL_EMAIL", "SEED_FAIL_PASSWORD"],
};

const INTEREST_SHORT = {
  EXERCISE: "운동", FOOD_CAFE: "맛집·카페 탐방", TRAVEL: "여행", MOVIE_DRAMA: "영화·드라마", MUSIC: "음악",
  READING: "독서", SELF_DEV: "자기계발", ART: "전시·공연", FASHION_BEAUTY: "패션·뷰티", PHOTO_VIDEO: "사진·영상",
};
const TRAIT_PHRASE = {
  LISTENER: "이야기를 잘 들어줘요", DEEP_TALK: "깊은 대화를 좋아해요", HUMOR_TALK: "유쾌한 대화를 좋아해요",
  CALM: "잔잔한 편이에요", ENERGETIC: "에너지 넘치는 편이에요", LEADER: "대화를 이끄는 편이에요",
};

// ---------- raw value mapping (03.데이터 정의서 9.1) ----------

// Splits "a, b (x, y), c" on commas outside parentheses.
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s || "") {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function mapRegions(raw) {
  const s = raw || "";
  if (/상관|무방|모두/.test(s)) return [...REGIONS];
  const out = new Set();
  if (/홍대|합정/.test(s)) out.add("HONGDAE");
  if (/강남|신논현/.test(s)) out.add("GANGNAM");
  if (/을지로|종로/.test(s)) out.add("EULJIRO");
  if (/잠실/.test(s)) out.add("JAMSIL");
  return out.size ? [...out] : ["ETC"];
}

function mapPrice(raw) {
  const s = raw || "";
  const out = [];
  if (s.includes("10,000~20,000")) out.push("P10_20");
  if (s.includes("20,000~30,000")) out.push("P20_30");
  if (s.includes("이상")) out.push("P30_PLUS");
  return out;
}

// 1회권 / 3회권 / 4회권 / "3회권 사용"(already holds a 3-pack).
function mapTicket(raw) {
  const s = raw || "";
  if (s.startsWith("3회권 사용")) return { product: "PACK3", existing: true };
  if (s.startsWith("4회권")) return { product: "PACK4", existing: false };
  if (s.startsWith("3회권")) return { product: "PACK3", existing: false };
  return { product: "SINGLE", existing: false };
}

// Obvious typos and a clearly stated type; answers naming two types stay UNKNOWN (모름).
const MBTI_FIXES = { WNTJ: "ENTJ", LSTP: "ISTP", WSFP: "ESFP" };
const mapMbti = (raw) => {
  const s = (raw || "").trim().toUpperCase();
  if (/^[EI][NS][TF][JP]$/.test(s)) return s;
  if (MBTI_FIXES[s]) return MBTI_FIXES[s];
  const stated = /^([EI][NS][TF][JP])인데/.exec(s);
  return stated ? stated[1] : "UNKNOWN";
};

function mapFoodAvoid(raw) {
  return splitTop(raw)
    .filter((v) => !/^(x|없|아니|다 잘)/i.test(v) && !v.includes("3만원"))
    .map((v) => v.slice(0, 30));
}

// "8/20(목)", "9/10 (목) (홍대, 강남만 가능!)" -> { date: "2026-09-10", only: ["HONGDAE","GANGNAM"] }
function parseDates(raw) {
  return splitTop(raw).map((v) => {
    const m = /^(\d{1,2})\/(\d{1,2})/.exec(v);
    if (!m) throw new Error(`unparsed date: ${v}`);
    const date = `${YEAR}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    const note = /\(([^)]*만[^)]*)\)/.exec(v)?.[1];
    return { date, only: note ? mapRegions(note).filter((r) => r !== "ETC") : null };
  });
}

const norm = (s) => s.replace(/[^가-힣a-zA-Z]/g, "").slice(0, 4);
function codeMapper(codes, group) {
  const byKey = new Map(codes.filter((c) => c.code_group === group).map((c) => [norm(c.label), c.code]));
  return (raw) => [...new Set(splitTop(raw).map((v) => byKey.get(norm(v))).filter(Boolean))];
}

function oneLiner(interests, traits) {
  const i = INTEREST_SHORT[interests[0]];
  const t = TRAIT_PHRASE[traits[0]];
  if (!i || !t) return null;
  return `${i} 좋아하고 ${t}`.slice(0, 30);
}

// ---------- time helpers (KST) ----------

const kst = (date, hhmm) => new Date(`${date}T${hhmm}:00+09:00`);
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// A random moment between `from` and `to`, never later than now.
function randomBetween(from, to) {
  const end = Math.min(to.getTime(), Date.now() - 60e3);
  const start = Math.min(from.getTime(), end);
  return new Date(start + rand() * (end - start));
}

// ---------- auth users ----------

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureUser(email, password, existing) {
  const found = existing.get(email);
  if (found) {
    if (password) await db.auth.admin.updateUserById(found.id, { password });
    return found.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: password || randomBytes(18).toString("base64url"),
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

const all = (q, col = "created_at") => q.not(col, "is", null);

// Deletes every row; PostgREST needs a filter, so use the first column the table has.
async function wipe(table) {
  for (const col of ["id", "created_at", "table_id", "round_id", "profile_id", "application_id", "job_key"]) {
    const { error } = await db.from(table).delete().not(col, "is", null);
    if (!error) return;
    if (!/does not exist/.test(error.message)) throw new Error(`reset ${table}: ${error.message}`);
  }
  throw new Error(`reset ${table}: no known column`);
}

async function reset() {
  // Children first, so foreign keys never block a delete.
  for (const t of [
    "chat_messages", "chat_rooms", "match_events", "alternative_offers", "match_resolutions", "feedbacks", "relations",
    "reports", "noshow_cases", "penalty_records", "sanctions", "notifications", "deliveries", "balance_answers",
    "status_history", "waitlist_offers", "refunds", "ticket_ledger", "exceptions", "inquiries", "match_resolutions", "job_runs",
  ]) await wipe(t);
  await wipe("table_contents");
  await wipe("table_members");
  await wipe("application_choices");
  must(await all(db.from("applications").update({ table_id: null, user_ticket_id: null, transferred_from: null })), "unlink apps");
  must(await all(db.from("user_tickets").update({ payment_id: null })), "unlink tickets");
  must(await all(db.from("payments").update({ coupon_id: null })), "unlink payments");
  await wipe("coupons");
  await wipe("payments");
  await wipe("applications");
  await wipe("user_tickets");
  await wipe("dining_tables");
  await wipe("match_runs");
  await wipe("venue_availability");
  await wipe("round_regions");
  await wipe("rounds");
  await wipe("venues");
  await wipe("notification_settings");
}

// ---------- main ----------

async function main() {
  if (process.argv.includes("--reset")) {
    await reset();
    console.log("reset done");
  } else if (must(await db.from("rounds").select("id").limit(1), "rounds").length > 0) {
    console.log("rounds already exist; run with --reset to rebuild demo data");
    return;
  }

  const codes = must(await db.from("code_values").select("*"), "code_values");
  const interests = codeMapper(codes, "INTEREST");
  const selfTraits = codeMapper(codes, "SELF_TRAIT");
  const wantedTraits = codeMapper(codes, "WANTED_TRAIT");
  const existing = new Map((await listAllUsers()).map((u) => [u.email, u]));
  const now = new Date().toISOString();
  const today = todayKst();

  // Test accounts (passwords come from .env.local).
  const operatorId = await ensureUser(process.env.SEED_OPERATOR_EMAIL, process.env.SEED_OPERATOR_PASSWORD, existing);
  const participantId = await ensureUser(process.env.SEED_PARTICIPANT_EMAIL, process.env.SEED_PARTICIPANT_PASSWORD, existing);
  must(
    await db.from("profiles").upsert([
      {
        id: operatorId, role: "OPERATOR", name: "운영자", display_name: "운영자", phone: "010-0000-0000",
        birth_year: 1990, gender: "F", job: "운영팀", mbti: "UNKNOWN", origin: "SEED", privacy_agreed_at: now, policy_agreed_at: now,
        notify_email: process.env.SEED_OPERATOR_EMAIL,
      },
      {
        id: participantId, role: "PARTICIPANT", name: "체험참가자", display_name: "체험참가자", phone: "010-0000-0001",
        birth_year: 1997, gender: "M", job: "개발자", mbti: "ENFP", interests: ["FOOD_CAFE", "TRAVEL"],
        self_traits: ["HUMOR_TALK"], wanted_traits: ["DEEP_TALK"], price_ranges: ["P20_30"],
        one_liner: "맛집 이야기 좋아해요", drink_pref: "LIGHT", origin: "SEED",
        privacy_agreed_at: now, policy_agreed_at: now, notify_email: process.env.SEED_PARTICIPANT_EMAIL,
      },
    ], { defaultToNull: false }),
    "test profiles",
  );
  must(await db.from("notification_settings").upsert([{ profile_id: operatorId }, { profile_id: participantId }]), "notification settings");

  // Scheduler endpoint for pg_cron (private.job_config).
  if (process.env.JOB_TICK_URL && process.env.CRON_SECRET) {
    must(await db.rpc("set_job_config", { p_url: process.env.JOB_TICK_URL, p_secret: process.env.CRON_SECRET }), "job config");
  }

  const applicants = JSON.parse(readFileSync(new URL("../supabase/seed-data/applicants.json", import.meta.url), "utf8"));
  for (const [row, name] of REAPPLY_1022) {
    if (applicants[row - 1]?.name !== name) throw new Error(`re-applicant row ${row} is not ${name}`);
  }

  // Rounds: every Thursday that appears in the data, plus 10/29 (new, no applicants yet).
  const dateSet = new Set(applicants.flatMap((a) => parseDates(a.dates).map((d) => d.date)));
  dateSet.add(`${YEAR}-10-29`);
  const rounds = [...dateSet].sort().map((date) => ({
    id: randomUUID(),
    title: `${Number(date.slice(5, 7))}/${Number(date.slice(8))}(목) 우연한 식탁`,
    event_date: date,
    start_at: kst(date, "19:00").toISOString(),
    end_at: kst(date, "21:00").toISOString(),
    apply_deadline_at: kst(addDays(date, -3), "18:00").toISOString(),
    match_run_at: kst(addDays(date, -3), "18:00").toISOString(),
    reminder_at: kst(addDays(date, -1), "18:00").toISOString(),
    status: date < today ? "DONE" : "OPEN",
    // Paused until the applications are in, so the scheduler cannot match a half-seeded round.
    setting_overrides: { auto_match: false },
    created_by: operatorId,
  }));
  const roundByDate = new Map(rounds.map((r) => [r.event_date, r]));
  await insertAll("rounds", rounds);
  await insertAll("round_regions", rounds.flatMap((r) => [
    ...REGIONS.map((region_code) => ({ round_id: r.id, region_code, capacity: 60 })),
    { round_id: r.id, region_code: "ETC", capacity: 0 },
  ]));

  const venueRows = [
    ["HONGDAE", "합정 소반", "서울 마포구 양화로 45", "P20_30"], ["HONGDAE", "연남 테이블", "서울 마포구 동교로 210", "P10_20"],
    ["GANGNAM", "신논현 다이닝", "서울 강남구 봉은사로 112", "P30_PLUS"], ["GANGNAM", "강남 한상", "서울 강남구 강남대로98길 12", "P20_30"],
    ["EULJIRO", "을지로 노포", "서울 중구 을지로 157", "P10_20"], ["EULJIRO", "종로 화로", "서울 종로구 종로 33", "P20_30"],
    ["JAMSIL", "잠실 호수식당", "서울 송파구 올림픽로 240", "P20_30"], ["JAMSIL", "석촌 키친", "서울 송파구 백제고분로 410", "P30_PLUS"],
  ];
  const venues = venueRows.map(([region_code, name, address, price_range]) => ({
    id: randomUUID(), region_code, name, address, price_range, map_url: `https://map.kakao.com/?q=${encodeURIComponent(address)}`,
  }));
  await insertAll("venues", venues);
  await insertAll("venue_availability", rounds.filter((r) => r.status === "OPEN").flatMap((r) =>
    venues.map((v) => ({ venue_id: v.id, round_id: r.id, table_slots: 8, max_seats: 6 }))));

  // Profiles + applications + payments + tickets + ledger, built in memory first.
  const profiles = [];
  const apps = [];
  const choices = [];
  const payments = [];
  const tickets = [];
  const ledger = [];
  const stats = { etc: 0, mbtiUnknown: 0, oneLiner: 0, food: 0, reapply: 0 };

  // Buys a ticket (with its mock payment) and returns it.
  function buy(profileId, product, paidAt, key, applicationId = null) {
    const pay = {
      id: randomUUID(), profile_id: profileId, application_id: applicationId, product_code: product, amount: PRICES[product],
      status: "PAID", idempotency_key: key, paid_at: paidAt.toISOString(), created_at: paidAt.toISOString(),
    };
    const validUntil = product === "SINGLE" ? null : addDays(paidAt.toISOString().slice(0, 10), VALID_DAYS);
    const ticket = {
      id: randomUUID(), profile_id: profileId, product_code: product, source: "PURCHASE", total_uses: USES[product],
      remaining_uses: USES[product], valid_until: validUntil, payment_id: pay.id, status: "ACTIVE", created_at: paidAt.toISOString(),
    };
    payments.push(pay);
    tickets.push(ticket);
    ledger.push({ user_ticket_id: ticket.id, application_id: null, delta: USES[product], reason: "PURCHASE", created_at: paidAt.toISOString() });
    return ticket;
  }
  function spend(ticket, applicationId, at) {
    ticket.remaining_uses -= 1;
    ledger.push({ user_ticket_id: ticket.id, application_id: applicationId, delta: -1, reason: "USE", created_at: at.toISOString() });
  }
  function addApplication(profileId, product, ticket, submittedAt, picks, active) {
    const app = {
      id: randomUUID(), profile_id: profileId, application_status: "SUBMITTED", payment_status: "PAID",
      ticket_product_code: product, user_ticket_id: ticket.id, submitted_at: submittedAt.toISOString(),
      is_active: active, created_at: submittedAt.toISOString(),
    };
    apps.push(app);
    for (const { round, regions } of picks) for (const region_code of regions) choices.push({ application_id: app.id, round_id: round.id, region_code });
    return app;
  }

  for (let i = 0; i < applicants.length; i++) {
    const a = applicants[i];
    const rowNo = i + 1;
    const n = String(rowNo).padStart(3, "0");
    const [emailKey, passwordKey] = DEMO_LOGINS[rowNo] ?? [];
    const demo = emailKey && process.env[emailKey] && process.env[passwordKey];
    if (demo && existing.has(`seed${n}@usangtak.test`)) {
      // Replaced by the demo login below; its rows were removed by --reset.
      await db.auth.admin.deleteUser(existing.get(`seed${n}@usangtak.test`).id);
      existing.delete(`seed${n}@usangtak.test`);
    }
    const id = demo
      ? await ensureUser(process.env[emailKey], process.env[passwordKey], existing)
      : await ensureUser(`seed${n}@usangtak.test`, null, existing);
    const age = Math.round(Number(a.age)) || 28;
    const name = (a.name || `참가자${n}`).slice(0, 20);
    const regions = mapRegions(a.regions);
    const dates = parseDates(a.dates);
    const firstDate = dates.map((d) => d.date).sort()[0];
    const submittedAt = randomBetween(kst(addDays(firstDate, -14), "09:00"), kst(addDays(firstDate, -4), "23:00"));
    const its = interests(a.interests);
    const selfs = selfTraits(a.self_traits);
    const liner = i % 2 === 0 ? oneLiner(its, selfs) : null;
    const food = mapFoodAvoid(a.food_avoid);
    const mbti = mapMbti(a.mbti);
    if (regions[0] === "ETC") stats.etc++;
    if (mbti === "UNKNOWN") stats.mbtiUnknown++;
    if (liner) stats.oneLiner++;
    if (food.length) stats.food++;

    profiles.push({
      id, role: "PARTICIPANT", name, display_name: name, phone: `010-9${n}-${String(1000 + i).slice(-4)}`,
      birth_year: YEAR - age, gender: a.gender === "여" ? "F" : "M", job: pick(JOBS), mbti,
      interests: its, self_traits: selfs, wanted_traits: wantedTraits(a.wanted_traits), price_ranges: mapPrice(a.price_ranges),
      food_avoid: food, allergies: DEMO_ALLERGIES[rowNo] ?? [], one_liner: liner, origin: "SEED",
      privacy_agreed_at: submittedAt.toISOString(), policy_agreed_at: submittedAt.toISOString(), created_at: submittedAt.toISOString(),
    });

    // The application from the form: all chosen dates; active only if a date is still open.
    const { product, existing: holdsPack } = mapTicket(a.ticket);
    let ticket;
    if (holdsPack) {
      // Bought a 3-pack three weeks earlier and used it once before this form.
      const boughtAt = new Date(submittedAt.getTime() - 21 * 86400e3);
      ticket = buy(id, "PACK3", boughtAt, `seed:${n}:prior-pack`);
      spend(ticket, null, new Date(boughtAt.getTime() + 7 * 86400e3));
    } else {
      ticket = buy(id, product, submittedAt, `seed:${n}:form`);
    }
    const picks = dates.map((d) => ({
      round: roundByDate.get(d.date),
      regions: d.only ? regions.filter((r) => d.only.includes(r)) : regions,
    })).filter((p) => p.regions.length);
    const active = picks.some((p) => p.round.status === "OPEN") && !REAPPLY_1022.some(([r]) => r === rowNo);
    const app = addApplication(id, product, ticket, submittedAt, picks, active);
    if (!holdsPack) payments[payments.length - 1].application_id = app.id;
    spend(ticket, app.id, submittedAt);

    // Demo pool: re-apply to 10/22 at 홍대, using a valid pack or paying for a new 1회권.
    if (REAPPLY_1022.some(([r]) => r === rowNo)) {
      const round = roundByDate.get(`${YEAR}-10-22`);
      const at = randomBetween(kst(`${YEAR}-10-15`, "09:00"), kst(`${YEAR}-10-18`, "23:00"));
      const usable = ticket.remaining_uses > 0 && ticket.valid_until && ticket.valid_until >= round.event_date;
      const reTicket = usable ? ticket : buy(id, "SINGLE", at, `seed:${n}:reapply`);
      const reApp = addApplication(id, usable ? ticket.product_code : "SINGLE", reTicket, at, [{ round, regions: ["HONGDAE"] }], true);
      if (!usable) payments[payments.length - 1].application_id = reApp.id;
      spend(reTicket, reApp.id, at);
      stats.reapply++;
    }
  }

  // Ticket status after all uses: used up, or expired with the rest written off.
  for (const t of tickets) {
    if (t.remaining_uses === 0) t.status = "USED_UP";
    else if (t.valid_until && t.valid_until < today) {
      ledger.push({ user_ticket_id: t.id, application_id: null, delta: -t.remaining_uses, reason: "EXPIRE", created_at: kst(t.valid_until, "23:59").toISOString() });
      t.remaining_uses = 0;
      t.status = "EXPIRED";
    }
  }

  for (let i = 0; i < profiles.length; i += 100) must(await db.from("profiles").upsert(profiles.slice(i, i + 100)), "seed profiles");
  // Payments reference applications and tickets reference payments, so insert in that order.
  const appRows = apps.map((a) => ({ ...a, user_ticket_id: null }));
  await insertAll("applications", appRows);
  await insertAll("payments", payments);
  await insertAll("user_tickets", tickets);
  for (const a of apps) must(await db.from("applications").update({ user_ticket_id: a.user_ticket_id }).eq("id", a.id), "link ticket");
  await insertAll("application_choices", choices);
  await insertAll("ticket_ledger", ledger);

  // Applications are in: let the scheduler match due rounds again.
  must(await db.from("rounds").update({ setting_overrides: {} }).in("id", rounds.map((r) => r.id)), "resume auto match");

  const open1022 = apps.filter((a) => a.is_active && choices.some((c) => c.application_id === a.id && c.round_id === roundByDate.get(`${YEAR}-10-22`).id));
  console.log(JSON.stringify({
    profiles: profiles.length + 2, rounds: rounds.length, done: rounds.filter((r) => r.status === "DONE").length,
    applications: apps.length, active: apps.filter((a) => a.is_active).length, pool1022: open1022.length,
    choices: choices.length, payments: payments.length, tickets: tickets.length, ledger: ledger.length, ...stats,
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
