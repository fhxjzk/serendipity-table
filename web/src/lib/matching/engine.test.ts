import { describe, expect, it } from "vitest";
import { partitionSizes, runMatching, violations } from "./engine";
import { mbtiPair, scoreTable } from "./score";
import type { Candidate, MatchSettings, Relation } from "./types";

const settings: MatchSettings = {
  weights: { gender_balance: 30, mbti: 25, interests: 20, wanted_traits: 15, new_people: 10 },
  minScore: 60,
  tableMin: 4,
  tableMax: 6,
  maxAgeGap: 8,
};

let seq = 0;
function person(gender: "M" | "F", age: number, regions: string[], extra: Partial<Candidate> = {}): Candidate {
  seq++;
  return {
    applicationId: `app${seq}`,
    profileId: `p${seq}`,
    gender,
    birthYear: 2026 - age,
    mbti: gender === "M" ? "ENFP" : "INFJ",
    interests: ["FOOD_CAFE", "TRAVEL", "MUSIC"],
    selfTraits: ["LISTENER", "HUMOR_TALK"],
    wantedTraits: ["EASY_HUMOR"],
    regions,
    hasLaterRound: false,
    ...extra,
  };
}

describe("partitionSizes", () => {
  it("splits into 4~6 sized groups", () => {
    expect(partitionSizes(8, 4, 6)).toEqual([4, 4]);
    expect(partitionSizes(9, 4, 6)).toEqual([5, 4]);
    expect(partitionSizes(12, 4, 6)).toEqual([6, 6]);
    expect(partitionSizes(13, 4, 6)).toEqual([5, 4, 4]);
  });
  it("leaves the rest when no exact split exists", () => {
    expect(partitionSizes(7, 4, 6)).toEqual([6]);
    expect(partitionSizes(3, 4, 6)).toEqual([]);
  });
});

describe("score", () => {
  it("treats unknown MBTI as neutral", () => {
    expect(mbtiPair("UNKNOWN", "ENFP")).toBe(0.5);
    expect(mbtiPair("ENFP", "INFP")).toBe(1);
  });
  it("rewards an even gender split and new people", () => {
    const even = [person("M", 30, ["A"]), person("M", 30, ["A"]), person("F", 30, ["A"]), person("F", 30, ["A"])];
    const s = scoreTable(even, settings, () => false);
    expect(s.components.gender_balance).toBe(1);
    expect(s.components.new_people).toBe(1);
    const metAll = scoreTable(even, settings, () => true);
    expect(metAll.total).toBeLessThan(s.total);
  });
});

describe("runMatching", () => {
  it("builds the 10/22 demo: two tables of 4, both originals fail", () => {
    const young = [
      person("M", 25, ["HONGDAE"]), person("M", 27, ["HONGDAE"]), person("M", 30, ["HONGDAE"]), person("M", 31, ["HONGDAE"]),
      person("F", 25, ["HONGDAE"]), person("F", 26, ["HONGDAE"]), person("F", 29, ["HONGDAE"]), person("F", 30, ["HONGDAE"]),
    ];
    const older = person("M", 39, ["HONGDAE", "EULJIRO"]);
    const eulOnly = person("F", 35, ["EULJIRO"]);
    const result = runMatching([...young, older, eulOnly], [], settings);

    expect(result.tables.map((t) => t.members.length).sort()).toEqual([4, 4]);
    for (const t of result.tables) {
      expect(t.regionCode).toBe("HONGDAE");
      expect(t.score.total).toBeGreaterThanOrEqual(60);
      expect(violations(t.members, [], settings)).toEqual([]);
    }
    const failed = Object.fromEntries(result.failures.map((f) => [f.candidate.applicationId, f.reason]));
    expect(failed).toEqual({ [older.applicationId]: "AGE_GAP", [eulOnly.applicationId]: "NOT_ENOUGH_PEOPLE" });
  });

  it("never seats blocked or reported people together", () => {
    const pool = [person("M", 28, ["A"]), person("F", 28, ["A"]), person("M", 29, ["A"]), person("F", 29, ["A"]), person("M", 30, ["A"]), person("F", 30, ["A"])];
    const relations: Relation[] = [{ from: pool[0].profileId, to: pool[1].profileId, type: "BLOCK" }];
    const result = runMatching(pool, relations, settings);
    for (const t of result.tables) expect(violations(t.members, relations, settings)).toEqual([]);
    const together = result.tables.some((t) => t.members.includes(pool[0]) && t.members.includes(pool[1]));
    expect(together).toBe(false);
  });

  it("does not penalise a pair who asked to meet again", () => {
    const pool = [person("M", 28, ["A"]), person("F", 28, ["A"]), person("M", 29, ["A"]), person("F", 29, ["A"])];
    const total = (rel: Relation[]) => runMatching(pool, rel, settings).tables[0].score.total;
    const met: Relation[] = pool.flatMap((a) => pool.filter((b) => b !== a).map((b) => ({ from: a.profileId, to: b.profileId, type: "MET" as const })));
    const metAndLiked: Relation[] = [...met, ...pool.flatMap((a) => pool.filter((b) => b !== a).map((b) => ({ from: a.profileId, to: b.profileId, type: "LIKE" as const })))];
    expect(total(met)).toBeLessThan(total([]));
    expect(total(metAndLiked)).toBe(total([]));
  });

  it("records people from a too-small region as re-allocated to another chosen region (demo step 4)", () => {
    const hongdae = [person("F", 27, ["HONGDAE"]), person("M", 28, ["HONGDAE"]), person("F", 29, ["HONGDAE"]), person("M", 30, ["HONGDAE"]), person("F", 28, ["HONGDAE"]), person("M", 31, ["HONGDAE"])];
    const gangnam = [person("F", 29, ["GANGNAM"]), person("M", 30, ["GANGNAM"]), person("F", 31, ["GANGNAM"]), person("M", 32, ["GANGNAM"])];
    const flex = [person("F", 30, ["EULJIRO", "GANGNAM"]), person("M", 29, ["EULJIRO", "GANGNAM"])];
    const older = person("M", 46, ["HONGDAE"]);
    const result = runMatching([...hongdae, ...gangnam, ...flex, older], [], settings);
    const moved = result.events.filter((e) => e.type === "REALLOCATED").map((e) => e.applicationId);
    expect(moved.sort()).toEqual(flex.map((f) => f.applicationId).sort());
    expect(result.tables.find((t) => t.members.includes(flex[0]))?.regionCode).toBe("GANGNAM");
    expect(result.failures.map((f) => [f.candidate.applicationId, f.reason])).toEqual([[older.applicationId, "AGE_GAP"]]);
  });

  it("moves a leftover into an open seat in another chosen region", () => {
    const a = [person("M", 30, ["A"]), person("F", 30, ["A"]), person("M", 31, ["A"]), person("F", 31, ["A"])];
    const b = [person("M", 30, ["B"]), person("F", 30, ["B"]), person("M", 31, ["B"]), person("F", 31, ["B"]), person("M", 29, ["B"]), person("F", 29, ["B"])];
    const flexible = person("F", 30, ["B", "A"]);
    const result = runMatching([...a, ...b, flexible], [], settings);
    expect(result.failures).toHaveLength(0);
    const seat = result.tables.find((t) => t.members.includes(flexible));
    expect(seat?.regionCode).toBe("A");
  });

  it("keeps hard rules on a large random pool", () => {
    let r = 7;
    const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    const regions = ["HONGDAE", "GANGNAM", "EULJIRO", "JAMSIL"];
    const mbtis = ["ENFP", "INFJ", "ISTJ", "ESTP", "UNKNOWN", "INTP", "ESFJ"];
    const pool = Array.from({ length: 150 }, () =>
      person(rand() < 0.66 ? "F" : "M", 20 + Math.floor(rand() * 24), regions.filter(() => rand() < 0.4).concat(regions[Math.floor(rand() * 4)]).filter((v, i, s) => s.indexOf(v) === i), {
        mbti: mbtis[Math.floor(rand() * mbtis.length)],
      }));
    const relations: Relation[] = Array.from({ length: 40 }, () => ({
      from: pool[Math.floor(rand() * 150)].profileId, to: pool[Math.floor(rand() * 150)].profileId, type: "DISLIKE" as const,
    })).filter((x) => x.from !== x.to);
    const result = runMatching(pool, relations, settings);

    const seated = result.tables.flatMap((t) => t.members.map((m) => m.applicationId));
    expect(new Set(seated).size).toBe(seated.length); // nobody at two tables
    expect(seated.length + result.failures.length).toBe(pool.length);
    for (const t of result.tables) {
      expect(violations(t.members, relations, settings)).toEqual([]);
      expect(t.members.every((m) => m.regions.includes(t.regionCode))).toBe(true);
      expect(t.score.total).toBeGreaterThanOrEqual(settings.minScore);
    }
    expect(seated.length / pool.length).toBeGreaterThan(0.8);
  });

  it("marks people with a later chosen round as waiting, not failed for good", () => {
    const lone = person("F", 30, ["JAMSIL"], { hasLaterRound: true });
    const result = runMatching([lone], [], settings);
    expect(result.failures[0]).toMatchObject({ reason: "NOT_ENOUGH_PEOPLE", waitsForLaterRound: true });
  });
});
