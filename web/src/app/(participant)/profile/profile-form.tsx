"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Chip, FieldError, Section, inputClass, primaryButton } from "@/components/participant-ui";
import { PushToggle } from "@/components/push-toggle";
import { saveProfile, type ProfileState } from "./actions";

type Code = { code: string; label: string };
export type ProfileFormData = {
  profile: {
    name: string; phone: string; birth_year: number; gender: string; job: string; mbti: string;
    interests: string[]; self_traits: string[]; wanted_traits: string[]; price_ranges: string[];
    food_avoid: string[]; allergies: string[]; one_liner: string | null; notify_email: string | null;
    privacy_agreed_at: string | null; policy_agreed_at: string | null;
  };
  codes: Record<"INTEREST" | "SELF_TRAIT" | "WANTED_TRAIT" | "PRICE_RANGE", Code[]>;
  emails: Record<string, boolean>;
  next?: string;
};

const MBTI_TYPES = ["ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP", "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ"];
const EMAIL_LABELS: [string, string][] = [
  ["email_payment_done", "결제 완료"], ["email_match_confirmed", "매칭 확정"], ["email_match_failed", "매칭 실패"],
  ["email_reminder", "행사 1일 전"], ["email_refund_done", "환불 완료"],
];

export function ProfileForm({ profile: p, codes, emails, next }: ProfileFormData) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />

      <Section title="기본 정보" hint="운영자만 볼 수 있어요. 같은 테이블에는 이름과 연령대만 보여요.">
        <Field label="이름" error={e.name}><input name="name" defaultValue={p.name} maxLength={20} className={inputClass} /></Field>
        <Field label="휴대전화" error={e.phone}><input name="phone" defaultValue={p.phone} inputMode="tel" placeholder="010-0000-0000" className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="출생연도" error={e.birthYear}><input name="birthYear" defaultValue={p.birth_year} inputMode="numeric" maxLength={4} className={inputClass} /></Field>
          <Field label="성별" error={e.gender}>
            <div className="flex h-11 items-center gap-2">
              <Chip type="radio" name="gender" value="F" label="여성" defaultChecked={p.gender === "F"} />
              <Chip type="radio" name="gender" value="M" label="남성" defaultChecked={p.gender === "M"} />
            </div>
          </Field>
        </div>
        <Field label="직업" error={e.job}><input name="job" defaultValue={p.job === "미기재" ? "" : p.job} maxLength={30} placeholder="예: 마케터" className={inputClass} /></Field>
      </Section>

      <Section title="매칭 선호" hint="자동 매칭에 쓰여요. 확정 후 같은 테이블에는 MBTI·관심사·한 줄 소개만 공개돼요.">
        <Field label="MBTI" error={e.mbti}>
          <select name="mbti" defaultValue={p.mbti} className={inputClass}>
            <option value="UNKNOWN">모름</option>
            {MBTI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Chips label="요즘 관심사 (1~5개)" name="interests" codes={codes.INTEREST} selected={p.interests} error={e.interests} />
        <Chips label="나는 어떤 사람인가요? (1~3개)" name="selfTraits" codes={codes.SELF_TRAIT} selected={p.self_traits} error={e.selfTraits} />
        <Chips label="어떤 사람을 만나고 싶나요? (1~3개)" name="wantedTraits" codes={codes.WANTED_TRAIT} selected={p.wanted_traits} error={e.wantedTraits} />
        <Field label="한 줄 소개 (선택, 30자)" error={e.oneLiner}><input name="oneLiner" defaultValue={p.one_liner ?? ""} maxLength={30} placeholder="예: 맛집 이야기라면 밤새 할 수 있어요" className={inputClass} /></Field>
      </Section>

      <Section title="식사 조건" hint="못 먹는 음식과 알레르기는 이름 없이 테이블 단위로만 공유돼요.">
        <Chips label="식사 가격대" name="priceRanges" codes={codes.PRICE_RANGE} selected={p.price_ranges} error={e.priceRanges} />
        <Field label="못 먹는 음식 (쉼표로 구분)" error={e.foodAvoid}><input name="foodAvoid" defaultValue={p.food_avoid.join(", ")} placeholder="예: 오이, 고수" className={inputClass} /></Field>
        <Field label="알레르기 (쉼표로 구분)" error={e.allergies}><input name="allergies" defaultValue={p.allergies.join(", ")} placeholder="예: 갑각류" className={inputClass} /></Field>
      </Section>

      <Section title="알림" hint="앱 안 알림은 항상 받아요. 이메일은 종류별로, 웹 푸시는 전체를 켜고 끌 수 있어요.">
        <Field label="알림 받을 이메일 (선택)" error={e.notifyEmail}><input name="notifyEmail" type="email" defaultValue={p.notify_email ?? ""} placeholder="name@example.com" className={inputClass} /></Field>
        <div className="flex flex-wrap gap-2">
          {EMAIL_LABELS.map(([k, label]) => <Chip key={k} name={k} value="on" label={label} defaultChecked={emails[k] ?? true} />)}
        </div>
        <PushToggle enabled={Boolean(emails.push_enabled)} />
      </Section>

      <Section title="동의">
        <Agree name="agreePrivacy" checked={!!p.privacy_agreed_at} error={e.agreePrivacy} label="개인정보 수집·이용에 동의해요 (필수)" detail="매칭과 모임 안내를 위해 기본 정보와 선호를 저장해요." />
        <Agree name="agreePolicy" checked={!!p.policy_agreed_at} error={e.agreePolicy} label="운영 정책에 동의해요 (필수)" detail="진행 2일 전부터 환불이 안 되고, 당일 불참·노쇼는 기록돼요." />
      </Section>

      {state.error && <p role="alert" className="text-[13px] text-ember">{state.error}</p>}
      {state.errors && Object.keys(state.errors).length > 0 && <p role="alert" className="text-[13px] text-ember">빨간 안내가 있는 항목을 확인해 주세요.</p>}
      {state.saved && <p className="text-[13px] text-emerald-700">저장했어요.</p>}
      <button disabled={pending} className={primaryButton}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {next ? "저장하고 다음으로" : "저장하기"}
      </button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink/80">{label}</span>
      {children}
      <FieldError message={error} />
    </label>
  );
}

function Chips({ label, name, codes, selected, error }: { label: string; name: string; codes: Code[]; selected: string[]; error?: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] font-medium text-ink/80">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {codes.map((c) => <Chip key={c.code} name={name} value={c.code} label={c.label} defaultChecked={selected.includes(c.code)} />)}
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}

function Agree({ name, checked, label, detail, error }: { name: string; checked: boolean; label: string; detail: string; error?: string }) {
  return (
    <label className="flex cursor-pointer gap-3">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-5 w-5 accent-[#2a211b]" />
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[12px] text-muted">{detail}</span>
        <FieldError message={error} />
      </span>
    </label>
  );
}
