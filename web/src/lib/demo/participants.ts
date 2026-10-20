// 테스트 참가자 일괄 생성 (기능 명세서 F-77, R-34): 13 people with different profiles apply and pay for one
// round through the same database functions a real participant uses. The mix is built so one matching
// run shows everything: two full tables, two people moved from a region that is too small (re-allocation),
// and one person who cannot join any table because of the age-gap rule. They never sign in, so the demo
// tools treat them as virtual applicants.
import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Spec = { name: string; gender: "M" | "F"; age: number; regions: string[] };
const SPECS: Spec[] = [
  { name: "김하은", gender: "F", age: 27, regions: ["HONGDAE"] },
  { name: "이준호", gender: "M", age: 28, regions: ["HONGDAE"] },
  { name: "박서연", gender: "F", age: 29, regions: ["HONGDAE"] },
  { name: "최민재", gender: "M", age: 30, regions: ["HONGDAE"] },
  { name: "정다인", gender: "F", age: 28, regions: ["HONGDAE"] },
  { name: "강현우", gender: "M", age: 31, regions: ["HONGDAE"] },
  { name: "윤지아", gender: "F", age: 29, regions: ["GANGNAM"] },
  { name: "임도현", gender: "M", age: 30, regions: ["GANGNAM"] },
  { name: "한소율", gender: "F", age: 31, regions: ["GANGNAM"] },
  { name: "오태윤", gender: "M", age: 32, regions: ["GANGNAM"] },
  { name: "서예린", gender: "F", age: 30, regions: ["EULJIRO", "GANGNAM"] },
  { name: "신우진", gender: "M", age: 29, regions: ["EULJIRO", "GANGNAM"] },
  { name: "문성호", gender: "M", age: 46, regions: ["HONGDAE"] },
];
const MBTI = ["ENFP", "ISTJ", "INFJ", "ESTP", "ENTJ", "ISFP", "INTP", "ESFJ", "INFP", "ENTP", "ISFJ", "ESTJ", "UNKNOWN"];
const INTERESTS = ["FOOD_CAFE", "MOVIE_DRAMA", "TRAVEL", "MUSIC", "EXERCISE", "READING", "ART", "SELF_DEV", "PHOTO_VIDEO", "FASHION_BEAUTY"];
const COMMON: Record<string, string[]> = { HONGDAE: ["FOOD_CAFE", "MOVIE_DRAMA"], GANGNAM: ["TRAVEL", "EXERCISE"] };
const SELF = ["LISTENER", "HUMOR_TALK", "DEEP_TALK", "CALM", "ENERGETIC", "LEADER"];
const WANTED = ["EASY_HUMOR", "CALM_STABLE", "DEEP_TALK", "PASSIONATE", "SIMILAR", "DIFFERENT"];
const JOBS = ["개발자", "디자이너", "마케터", "간호사", "교사", "회계사", "PD", "연구원", "기획자", "영업직", "공무원", "약사", "건축가"];
// One per person, so nobody at a demo table shares a sentence.
const LINERS = [
  "맛집 지도를 만들고 있어요", "주말엔 한강에서 러닝해요", "영화 이야기라면 밤새도 좋아요", "처음 만나는 자리도 편하게 즐겨요", null,
  "요즘 재즈 바에 빠졌어요", "필름 카메라 들고 다녀요", "여행 계획 세우는 게 취미예요", "어색함은 제가 깰게요", "독립서점 구경을 좋아해요",
  "새로 생긴 카페는 꼭 가 봐요", null, "등산 메이트 구해요",
];

export async function generateDemoParticipants(db: SupabaseClient, roundId: string) {
  const { data: round } = await db.from("rounds").select("id, event_date, status, round_regions(region_code, capacity)").eq("id", roundId).single();
  if (!round || round.status !== "OPEN") throw new Error("ROUND_NOT_OPEN");
  const offered = ((round.round_regions ?? []) as { region_code: string; capacity: number }[]).filter((r) => r.capacity > 0).map((r) => r.region_code);

  // Once per round: a second batch would only add the same names again.
  const { data: existing } = await db.from("application_choices").select("applications!inner(profiles!inner(origin))").eq("round_id", roundId).eq("applications.profiles.origin", "BULK").limit(1);
  if (existing?.length) throw new Error("ALREADY_GENERATED");

  const tag = Date.now().toString(36);
  const year = Number(round.event_date.slice(0, 4));
  let created = 0;
  for (const [i, s] of SPECS.entries()) {
    const regions = s.regions.filter((r) => offered.includes(r));
    if (!regions.length) continue;
    const { data: user, error } = await db.auth.admin.createUser({
      email: `bulk-${tag}-${String(i + 1).padStart(2, "0")}@usangtak.test`,
      password: randomBytes(18).toString("base64url"),
      email_confirm: true,
    });
    if (error || !user.user) throw new Error(`createUser: ${error?.message}`);
    const id = user.user.id;
    // A login without a profile would be an orphan; drop it if anything below fails.
    const fail = async (what: string, message: string) => {
      await db.auth.admin.deleteUser(id);
      throw new Error(`${what}: ${message}`);
    };
    const now = new Date().toISOString();
    const { error: pe } = await db.from("profiles").insert({
      id, role: "PARTICIPANT", name: s.name, display_name: s.name, phone: `010-7${String(i).padStart(3, "0")}-${String(Date.now()).slice(-4)}`,
      birth_year: year - s.age, gender: s.gender, job: JOBS[i % JOBS.length], mbti: MBTI[i % MBTI.length],
      // Each region group shares two interests, so the tables they form score well above the minimum.
      interests: [...COMMON[s.regions.at(-1) ?? "HONGDAE"], INTERESTS[(i + 5) % 10]].filter((v, k, a) => a.indexOf(v) === k),
      self_traits: [SELF[i % 6], SELF[(i + 2) % 6]], wanted_traits: [WANTED[i % 6]], price_ranges: ["P20_30"],
      food_avoid: [], allergies: i === 4 ? ["견과류"] : [], one_liner: LINERS[i % LINERS.length], drink_pref: i % 3 === 0 ? "NONE" : "LIGHT",
      origin: "BULK", privacy_agreed_at: now, policy_agreed_at: now,
    });
    if (pe) await fail("profile", pe.message);
    const { data: appId, error: ae } = await db.rpc("submit_application", { p_profile: id, p_choices: regions.map((r) => ({ round_id: roundId, region_code: r })) });
    if (ae) throw new Error(`submit_application: ${ae.message}`);
    const { error: payErr } = await db.rpc("pay_application", { p_profile: id, p_app: appId, p_option: "SINGLE", p_ticket: null });
    if (payErr) throw new Error(`pay_application: ${payErr.message}`);
    created += 1;
  }
  return created;
}
