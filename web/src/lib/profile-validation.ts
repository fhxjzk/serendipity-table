// Profile input rules from 기능 명세서 4.1. Pure so the form, the server action and tests share it.

export type ProfileInput = {
  name: string;
  phone: string;
  birthYear: string;
  gender: string;
  job: string;
  mbti: string;
  interests: string[];
  selfTraits: string[];
  wantedTraits: string[];
  priceRanges: string[];
  foodAvoid: string;
  allergies: string;
  oneLiner: string;
  notifyEmail: string;
  agreePrivacy: boolean;
  agreePolicy: boolean;
};

export type ProfileValue = {
  name: string;
  phone: string;
  birth_year: number;
  gender: "M" | "F";
  job: string;
  mbti: string;
  interests: string[];
  self_traits: string[];
  wanted_traits: string[];
  price_ranges: string[];
  food_avoid: string[];
  allergies: string[];
  one_liner: string | null;
  notify_email: string | null;
};

export type FieldErrors = Partial<Record<keyof ProfileInput, string>>;

const MBTI = /^[EI][NS][TF][JP]$/;

// "커피, 땅콩 ,," -> ["커피", "땅콩"]
export const splitTags = (s: string) => [...new Set(s.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))];

export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!/^010\d{7,8}$/.test(digits)) return null;
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function validateProfile(input: ProfileInput, year = new Date().getFullYear()): { errors: FieldErrors; value?: ProfileValue } {
  const errors: FieldErrors = {};
  const name = input.name.trim();
  if (!name || name.length > 20) errors.name = "이름은 1~20자로 입력해 주세요.";
  const phone = normalizePhone(input.phone);
  if (!phone) errors.phone = "010으로 시작하는 휴대전화 번호를 입력해 주세요.";
  const birthYear = Number(input.birthYear);
  if (!Number.isInteger(birthYear) || birthYear < 1960 || birthYear > year - 19) errors.birthYear = `출생연도는 1960~${year - 19} 사이로 입력해 주세요.`;
  if (input.gender !== "M" && input.gender !== "F") errors.gender = "성별을 선택해 주세요.";
  const job = input.job.trim();
  if (!job || job.length > 30) errors.job = "직업은 1~30자로 입력해 주세요.";
  const mbti = input.mbti.toUpperCase();
  if (mbti !== "UNKNOWN" && !MBTI.test(mbti)) errors.mbti = "MBTI를 고르거나 '모름'을 선택해 주세요.";
  if (input.interests.length < 1 || input.interests.length > 5) errors.interests = "관심사는 1~5개 골라 주세요.";
  if (input.selfTraits.length < 1 || input.selfTraits.length > 3) errors.selfTraits = "나를 표현하는 성향을 1~3개 골라 주세요.";
  if (input.wantedTraits.length < 1 || input.wantedTraits.length > 3) errors.wantedTraits = "만나고 싶은 사람의 성향을 1~3개 골라 주세요.";
  if (input.priceRanges.length < 1) errors.priceRanges = "식사 가격대를 1개 이상 골라 주세요.";
  const food = splitTags(input.foodAvoid);
  if (food.length > 10 || food.some((t) => t.length > 30)) errors.foodAvoid = "못 먹는 음식은 10개까지, 항목당 30자 이내로 적어 주세요.";
  const allergies = splitTags(input.allergies);
  if (allergies.length > 10 || allergies.some((t) => t.length > 30)) errors.allergies = "알레르기는 10개까지, 항목당 30자 이내로 적어 주세요.";
  const oneLiner = input.oneLiner.trim();
  if (oneLiner.length > 30) errors.oneLiner = "한 줄 소개는 30자 이내로 적어 주세요.";
  const email = input.notifyEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.notifyEmail = "이메일 형식을 확인해 주세요.";
  if (!input.agreePrivacy) errors.agreePrivacy = "개인정보 수집·이용에 동의해야 신청할 수 있어요.";
  if (!input.agreePolicy) errors.agreePolicy = "운영 정책(환불·노쇼)에 동의해야 신청할 수 있어요.";

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    value: {
      name, phone: phone!, birth_year: birthYear, gender: input.gender as "M" | "F", job, mbti,
      interests: input.interests, self_traits: input.selfTraits, wanted_traits: input.wantedTraits, price_ranges: input.priceRanges,
      food_avoid: food, allergies, one_liner: oneLiner || null, notify_email: email || null,
    },
  };
}
