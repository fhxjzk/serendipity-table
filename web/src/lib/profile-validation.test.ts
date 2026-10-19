import { describe, expect, it } from "vitest";
import { normalizePhone, splitTags, validateProfile, type ProfileInput } from "./profile-validation";

const ok: ProfileInput = {
  name: "김우연", phone: "010-1234-5678", birthYear: "1997", gender: "F", job: "디자이너", mbti: "infp",
  interests: ["TRAVEL"], selfTraits: ["CALM"], wantedTraits: ["DEEP_TALK"], priceRanges: ["P20_30"],
  foodAvoid: "오이, 고수", allergies: "", oneLiner: "", notifyEmail: "", agreePrivacy: true, agreePolicy: true,
};

describe("validateProfile", () => {
  it("accepts a complete profile and normalizes values", () => {
    const { errors, value } = validateProfile(ok, 2026);
    expect(errors).toEqual({});
    expect(value).toMatchObject({ mbti: "INFP", phone: "010-1234-5678", birth_year: 1997, food_avoid: ["오이", "고수"], one_liner: null });
  });

  it("reports each broken rule next to its field", () => {
    const { errors, value } = validateProfile(
      { ...ok, name: "  ", phone: "02-123-4567", birthYear: "2010", interests: [], selfTraits: ["A", "B", "C", "D"], oneLiner: "가".repeat(31), agreePolicy: false },
      2026,
    );
    expect(value).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(["agreePolicy", "birthYear", "interests", "name", "oneLiner", "phone", "selfTraits"]);
  });

  it("allows 모름 for MBTI", () => {
    expect(validateProfile({ ...ok, mbti: "UNKNOWN" }, 2026).errors.mbti).toBeUndefined();
  });
});

describe("helpers", () => {
  it("formats phone numbers and rejects others", () => {
    expect(normalizePhone("01012345678")).toBe("010-1234-5678");
    expect(normalizePhone("0101234567")).toBe("010-123-4567");
    expect(normalizePhone("011-1234-5678")).toBeNull();
  });
  it("splits tags and drops duplicates", () => {
    expect(splitTags("땅콩, 땅콩,\n새우 ,")).toEqual(["땅콩", "새우"]);
  });
});
