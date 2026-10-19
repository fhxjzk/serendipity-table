// After a round is matched: per confirmed table, venue + chat room + system messages
// (finalize_confirmed_table), and an in-app notice for everyone who was not seated.
// Safe to call again: the DB side skips what already exists.
import type { SupabaseClient } from "@supabase/supabase-js";

type Member = { interests: string[]; self_traits: string[]; food_avoid: string[]; allergies: string[] };

export const POLICY_TEXT =
  "취소 정책: 행사 2일 전부터는 환불되지 않아요. 당일에는 취소 대신 '불참 알림'으로 미리 알려 주세요. 단체방은 행사 후 피드백까지 열려 있어요.";

// Picks the particle by whether the last Hangul syllable has a final consonant: 을/를, 과/와, 이라고/라고.
export function josa(word: string, withBatchim: string, without: string) {
  const ch = word.replace(/['"]/g, "");
  const code = ch.charCodeAt(ch.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withBatchim : without);
}

// "맛집·카페 탐방과 여행을 좋아하는 분들이 모였어요. 스스로 '경청을 잘 함'이라고 답한 분이 3명이에요."
export function buildCuration(members: Member[], labels: Map<string, string>) {
  const count = (codes: string[][]) => {
    const m = new Map<string, number>();
    for (const list of codes) for (const c of new Set(list)) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  };
  const interests = count(members.map((m) => m.interests)).slice(0, 2).map(([c]) => labels.get(`INTEREST:${c}`) ?? c);
  const trait = count(members.map((m) => m.self_traits))[0];
  const parts = [`${members.length}명이 함께하는 식탁이에요.`];
  if (interests.length) {
    const joined = interests.length === 2 ? `${josa(interests[0], "과", "와")} ${interests[1]}` : interests[0];
    parts.push(`${josa(joined, "을", "를")} 좋아하는 분들이 모였어요.`);
  }
  if (trait) {
    const label = labels.get(`SELF_TRAIT:${trait[0]}`) ?? trait[0];
    parts.push(`스스로 ${josa(`'${label}'`, "이라고", "라고")} 답한 분이 ${trait[1]}명이에요.`);
  }
  parts.push("첫 만남이니 가볍게 인사부터 나눠 보세요.");
  return parts.join(" ");
}

// Names never appear: only counts per item (F-38).
export function buildFoodSummary(members: Member[]) {
  const tally = (lists: string[][]) => {
    const m = new Map<string, number>();
    for (const l of lists) for (const x of new Set(l)) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => `${k} ${n}명`).join(", ");
  };
  const allergies = tally(members.map((m) => m.allergies));
  const avoid = tally(members.map((m) => m.food_avoid));
  if (!allergies && !avoid) return "식사 조건: 이 식탁에는 알레르기나 못 먹는 음식이 없어요.";
  return ["식사 조건 (이름 없이 공유돼요)", allergies && `알레르기: ${allergies}`, avoid && `못 먹는 음식: ${avoid}`].filter(Boolean).join("\n");
}

export async function finalizeRound(db: SupabaseClient, roundId: string) {
  const [{ data: tables, error }, { data: codes }] = await Promise.all([
    db.from("dining_tables")
      .select("id, table_members(left_at, application_id, profiles(interests, self_traits, food_avoid, allergies))")
      .eq("round_id", roundId).eq("status", "CONFIRMED"),
    db.from("code_values").select("code_group, code, label").in("code_group", ["INTEREST", "SELF_TRAIT"]),
  ]);
  if (error) throw new Error(`finalize tables: ${error.message}`);
  const labels = new Map((codes ?? []).map((c) => [`${c.code_group}:${c.code}`, c.label]));

  const results = [];
  for (const t of tables ?? []) {
    const members = (t.table_members ?? [])
      .filter((m) => !m.left_at)
      .map((m) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as Member)
      .filter(Boolean);
    const { data, error: e } = await db.rpc("finalize_confirmed_table", {
      p_table: t.id, p_curation: buildCuration(members, labels), p_food_summary: buildFoodSummary(members), p_policy: POLICY_TEXT,
    });
    if (e) throw new Error(`finalize_confirmed_table: ${e.message}`);
    results.push(data);
  }

  // Not seated: point them to the resolution screen (S-06).
  const { data: choices } = await db.from("application_choices").select("application_id").eq("round_id", roundId);
  const ids = [...new Set((choices ?? []).map((c) => c.application_id))];
  if (ids.length) {
    const { data: failed } = await db.from("applications").select("id, profile_id")
      .in("id", ids).eq("is_active", true).in("match_status", ["ALTERNATIVE_OFFERED", "EXCEPTION"]);
    if (failed?.length) {
      await db.from("notifications").upsert(
        failed.map((a) => ({
          profile_id: a.profile_id, type: "MATCH_FAILED", title: "이번에는 식탁을 찾지 못했어요",
          body: "다른 일정으로 옮기거나 이용권 보관·환불 중에서 고를 수 있어요. 보상 쿠폰도 함께 드렸어요.",
          link: `/applications/${a.id}/resolve`, dedupe_key: `matchfail:${a.id}`,
        })),
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
    }
  }
  return results;
}
