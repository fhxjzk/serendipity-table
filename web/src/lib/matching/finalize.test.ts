import { describe, expect, it } from "vitest";
import { buildCuration, buildFoodSummary, josa } from "./finalize";

const labels = new Map([
  ["INTEREST:FOOD_CAFE", "맛집·카페 탐방"], ["INTEREST:MOVIE_DRAMA", "영화·드라마"], ["INTEREST:TRAVEL", "여행"],
  ["SELF_TRAIT:LISTENER", "경청을 잘 함"],
]);
const m = (interests: string[], food: string[] = [], allergies: string[] = []) => ({ interests, self_traits: ["LISTENER"], food_avoid: food, allergies });

describe("josa", () => {
  it("picks the particle by the final consonant", () => {
    expect(josa("영화·드라마", "을", "를")).toBe("영화·드라마를");
    expect(josa("맛집·카페 탐방", "과", "와")).toBe("맛집·카페 탐방과");
    expect(josa("'경청을 잘 함'", "이라고", "라고")).toBe("'경청을 잘 함'이라고");
  });
});

describe("table texts", () => {
  it("writes a natural curation from shared interests and traits", () => {
    const text = buildCuration([m(["FOOD_CAFE", "MOVIE_DRAMA"]), m(["FOOD_CAFE", "MOVIE_DRAMA"]), m(["TRAVEL"]), m(["TRAVEL"])], labels);
    expect(text).toContain("4명이 함께하는 식탁이에요.");
    expect(text).toMatch(/를 좋아하는 분들이 모였어요|을 좋아하는 분들이 모였어요/);
    expect(text).toContain("'경청을 잘 함'이라고 답한 분이 4명이에요.");
  });

  it("summarizes food conditions without names", () => {
    expect(buildFoodSummary([m([], ["오이"], ["갑각류"]), m([], ["오이"])])).toBe("식사 조건 (이름 없이 공유돼요)\n알레르기: 갑각류 1명\n못 먹는 음식: 오이 2명");
    expect(buildFoodSummary([m([])])).toContain("없어요");
  });
});
