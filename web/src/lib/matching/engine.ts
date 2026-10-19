// Automatic matching for one round (기능 명세서 F-23~F-30, 요구 분석서 5.1·5.2).
// Pure function: candidates + relations + settings in, tables + failures + events out.
//
//   1. Per region, drop people who cannot fit any age window of 4+ (hard rule, never relaxed).
//   2. Split the rest into 4~6 sized groups and fill each greedily by score,
//      starting from the hardest-to-place person (fewest regions, most unusual age).
//   3. Reallocate leftovers into open seats of tables in their chosen regions (5.2 ①②).
//   4. Merge the remaining leftovers into new tables where possible.
//   5. Whoever is left fails: waits for a later chosen round, or gets an alternative offer.
import { scoreTable } from "./score";
import type { Candidate, FailReason, Failure, FormedTable, MatchEvent, MatchResult, MatchSettings, Relation } from "./types";

export const ALGORITHM_VERSION = "greedy-v1";

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Group sizes for n people within [min, max]. When no exact split exists (e.g. 7 → 4+3),
// fill full tables and leave the rest for reallocation.
export function partitionSizes(n: number, min: number, max: number): number[] {
  const k = Math.ceil(n / max);
  if (n < min) return [];
  if (k * min > n) return Array.from({ length: k - 1 }, () => max);
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

export function runMatching(candidates: Candidate[], relations: Relation[], settings: MatchSettings): MatchResult {
  const { tableMin: min, tableMax: max, maxAgeGap, minScore } = settings;
  const conflicts = new Set(relations.filter((r) => r.type !== "MET" && r.type !== "LIKE").map((r) => key(r.from, r.to)));
  const met = new Set(relations.filter((r) => r.type === "MET").map((r) => key(r.from, r.to)));
  const metBefore = (a: string, b: string) => met.has(key(a, b));
  const score = (group: Candidate[]) => scoreTable(group, settings, metBefore);

  const ageOk = (group: Candidate[]) => {
    const ys = group.map((c) => c.birthYear);
    return Math.max(...ys) - Math.min(...ys) <= maxAgeGap;
  };
  const canJoin = (group: Candidate[], c: Candidate) =>
    ageOk([...group, c]) && group.every((g) => !conflicts.has(key(g.profileId, c.profileId)));

  // Is there an age window of width maxAgeGap containing c with at least `min` people?
  const hasAgeWindow = (c: Candidate, pool: Candidate[]) =>
    pool.some((s) => {
      const lo = s.birthYear;
      if (c.birthYear < lo || c.birthYear > lo + maxAgeGap) return false;
      return pool.filter((p) => p.birthYear >= lo && p.birthYear <= lo + maxAgeGap).length >= min;
    });

  const tables: FormedTable[] = [];
  const events: MatchEvent[] = [];
  const unassigned = new Set(candidates.filter((c) => c.regions.length > 0));

  function buildRegion(region: string, pool: Candidate[], placedReason: string) {
    let remaining = pool.filter((c) => hasAgeWindow(c, pool));
    for (const c of pool) if (!remaining.includes(c)) events.push({ applicationId: c.applicationId, type: "RELEASED", reason: "AGE_GAP", regionCode: region });
    const sizesAtStart = partitionSizes(remaining.length, min, max);
    const firstNew = tables.length;

    while (remaining.length >= min) {
      const target = partitionSizes(remaining.length, min, max)[0];
      const ys = remaining.map((c) => c.birthYear).sort((a, b) => a - b);
      const median = ys[Math.floor(ys.length / 2)];
      remaining.sort((a, b) => a.regions.length - b.regions.length || Math.abs(b.birthYear - median) - Math.abs(a.birthYear - median));
      const seed = remaining[0];
      const group = [seed];

      while (group.length < target) {
        const opts = remaining.filter((c) => !group.includes(c) && canJoin(group, c));
        const needAfter = Math.max(0, min - group.length - 1);
        const viable = opts.filter((c) => opts.filter((o) => o !== c && canJoin([...group, c], o)).length >= needAfter);
        if (viable.length === 0) break;
        let best = viable[0];
        let bestValue = -Infinity;
        for (const c of viable) {
          // Small nudge toward people with fewer region options, so flexible people stay available.
          const value = score([...group, c]).total - 0.5 * (c.regions.length - 1);
          if (value > bestValue) [best, bestValue] = [c, value];
        }
        group.push(best);
      }

      const s = group.length >= min ? score(group) : null;
      if (s && s.total >= minScore) {
        const tableIndex = tables.push({ regionCode: region, members: group, score: s }) - 1;
        for (const c of group) {
          unassigned.delete(c);
          events.push({ applicationId: c.applicationId, type: "PLACED", reason: placedReason, regionCode: region, tableIndex });
        }
        remaining = remaining.filter((c) => !group.includes(c));
      } else {
        events.push({
          applicationId: seed.applicationId, type: "RELEASED", regionCode: region,
          reason: s ? "LOW_SCORE" : "NO_GROUP", detail: s ? { score: s.total } : { reached: group.length },
        });
        remaining = remaining.filter((c) => c !== seed);
      }
    }
    if (sizesAtStart.length > 1) {
      for (let i = firstNew; i < tables.length; i++) {
        for (const c of tables[i].members) events.push({ applicationId: c.applicationId, type: "SPLIT", reason: "POOL_SPLIT", regionCode: region, tableIndex: i, detail: { poolSize: pool.length, tables: sizesAtStart.length } });
      }
    }
    return firstNew;
  }

  const regionsInPlay = [...new Set(candidates.flatMap((c) => c.regions))];
  const poolOf = (region: string) => [...unassigned].filter((c) => c.regions.includes(region));
  const singleChoice = (region: string) => poolOf(region).filter((c) => c.regions.length === 1).length;

  // 1~2. Regions with the most people who have nowhere else to go come first.
  for (const region of [...regionsInPlay].sort((a, b) => singleChoice(b) - singleChoice(a) || poolOf(b).length - poolOf(a).length)) {
    buildRegion(region, poolOf(region), "INITIAL");
  }

  // 3. Open seats in chosen regions (same date, same or other chosen region).
  for (const c of [...unassigned].sort((a, b) => a.regions.length - b.regions.length)) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    tables.forEach((t, i) => {
      if (!c.regions.includes(t.regionCode) || t.members.length >= max || !canJoin(t.members, c)) return;
      const s = score([...t.members, c]).total;
      if (s >= minScore && s > bestScore) [bestIndex, bestScore] = [i, s];
    });
    if (bestIndex >= 0) {
      const t = tables[bestIndex];
      t.members.push(c);
      t.score = score(t.members);
      unassigned.delete(c);
      events.push({ applicationId: c.applicationId, type: "REALLOCATED", reason: "OPEN_SEAT", regionCode: t.regionCode, tableIndex: bestIndex });
    }
  }

  // 4. Leftovers that together make a valid table.
  for (const region of regionsInPlay) {
    const pool = poolOf(region);
    if (pool.length < min) continue;
    const firstNew = buildRegion(region, pool, "MERGED");
    for (let i = firstNew; i < tables.length; i++) {
      for (const c of tables[i].members) events.push({ applicationId: c.applicationId, type: "MERGED", reason: "LEFTOVER_MERGE", regionCode: region, tableIndex: i });
    }
  }

  // 5. Failures with the reason the participant will see.
  function failReason(c: Candidate): FailReason {
    if (c.regions.length === 0) return "NO_REGION";
    const pools = c.regions.map((r) => candidates.filter((o) => o.regions.includes(r)));
    if (pools.every((p) => p.length < min)) return "NOT_ENOUGH_PEOPLE";
    if (pools.every((p) => p.length < min || !hasAgeWindow(c, p))) return "AGE_GAP";
    if (pools.some((p) => p.some((o) => o !== c && conflicts.has(key(o.profileId, c.profileId))))) return "RELATION_CONFLICT";
    return "LOW_SCORE";
  }

  const failures: Failure[] = [];
  for (const c of candidates) {
    if (tables.some((t) => t.members.includes(c))) continue;
    const reason = failReason(c);
    failures.push({ candidate: c, reason, waitsForLaterRound: c.hasLaterRound });
    events.push({ applicationId: c.applicationId, type: "FAILED", reason, detail: { waitsForLaterRound: c.hasLaterRound } });
  }

  tables.forEach((t, i) => {
    for (const c of t.members) events.push({ applicationId: c.applicationId, type: "CONFIRMED", reason: "AUTO_CONFIRM", regionCode: t.regionCode, tableIndex: i, detail: { score: t.score.total } });
  });

  return { tables, failures, events };
}

// Re-check of every hard rule on a finished table (F-25), used before confirming.
export function violations(members: Candidate[], relations: Relation[], settings: MatchSettings): string[] {
  const out: string[] = [];
  if (members.length < settings.tableMin || members.length > settings.tableMax) out.push("SIZE");
  const ys = members.map((c) => c.birthYear);
  if (Math.max(...ys) - Math.min(...ys) > settings.maxAgeGap) out.push("AGE_GAP");
  const ids = new Set(members.map((m) => m.profileId));
  if (relations.some((r) => r.type !== "MET" && r.type !== "LIKE" && ids.has(r.from) && ids.has(r.to))) out.push("RELATION");
  return out;
}
