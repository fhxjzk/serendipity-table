// Preference score for a table (기능 명세서 F-26, weights from app_settings.match_weights).
// Each component is 0..1; the table score is the weighted sum on a 0..100 scale.
import type { Candidate, MatchSettings, ScoreDetail } from "./types";

const pairs = <T>(xs: T[]): [T, T][] => {
  const out: [T, T][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  return out;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// 1 when men and women are even, 0 when everyone is the same gender.
export function genderBalance(members: Candidate[]) {
  const m = members.filter((c) => c.gender === "M").length;
  return 1 - Math.abs(m - (members.length - m)) / members.length;
}

// Pair compatibility: same N/S (how people talk about things) matters most,
// a mix of E/I keeps the conversation going, same J/P eases planning.
// Unknown MBTI ("모름") is neutral.
export function mbtiPair(a: string, b: string) {
  if (a === "UNKNOWN" || b === "UNKNOWN") return 0.5;
  return (a[1] === b[1] ? 0.5 : 0) + (a[0] !== b[0] ? 0.3 : 0) + (a[3] === b[3] ? 0.2 : 0);
}

export function interestPair(a: Candidate, b: Candidate) {
  const shared = a.interests.filter((i) => b.interests.includes(i)).length;
  return Math.min(1, shared / 2);
}

// Does `other` look like the kind of person `me` wants to meet?
export function wantedMatch(me: Candidate, other: Candidate) {
  return me.wantedTraits.some((w) => {
    switch (w) {
      case "EASY_HUMOR": return other.selfTraits.includes("HUMOR_TALK");
      case "CALM_STABLE": return other.selfTraits.includes("CALM") || other.selfTraits.includes("LISTENER");
      case "DEEP_TALK": return other.selfTraits.includes("DEEP_TALK");
      case "PASSIONATE": return other.selfTraits.includes("ENERGETIC") || other.selfTraits.includes("LEADER");
      case "SIMILAR": return interestPair(me, other) >= 1;
      case "DIFFERENT":
        return (me.mbti !== "UNKNOWN" && other.mbti !== "UNKNOWN" && me.mbti[0] !== other.mbti[0]) || interestPair(me, other) === 0;
      default: return false;
    }
  });
}

export function wantedScore(members: Candidate[]) {
  return avg(members.map((me) => {
    if (me.wantedTraits.length === 0) return 0.5;
    const others = members.filter((o) => o !== me);
    return others.filter((o) => wantedMatch(me, o)).length / others.length;
  }));
}

export function scoreTable(members: Candidate[], settings: MatchSettings, metBefore: (a: string, b: string) => boolean): ScoreDetail {
  const ps = pairs(members);
  const components = {
    gender_balance: genderBalance(members),
    mbti: avg(ps.map(([a, b]) => mbtiPair(a.mbti, b.mbti))),
    interests: avg(ps.map(([a, b]) => interestPair(a, b))),
    wanted_traits: wantedScore(members),
    new_people: 1 - ps.filter(([a, b]) => metBefore(a.profileId, b.profileId)).length / ps.length,
  };
  const w = settings.weights;
  const total =
    w.gender_balance * components.gender_balance +
    w.mbti * components.mbti +
    w.interests * components.interests +
    w.wanted_traits * components.wanted_traits +
    w.new_people * components.new_people;
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return {
    total: round1(total),
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])) as ScoreDetail["components"],
  };
}
