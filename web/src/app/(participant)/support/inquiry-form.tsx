"use client";

import { useActionState } from "react";
import { closeInquiry, submitInquiry, type InquiryState } from "./actions";
import { FieldError, inputClass, primaryButton } from "@/components/participant-ui";

const CATEGORIES = [
  ["PAYMENT_REFUND", "결제·환불"], ["MATCHING", "매칭"], ["SCHEDULE", "일정"], ["CANCEL", "취소·불참"], ["ETC", "기타"],
] as const;

export function InquiryForm() {
  const [state, action, pending] = useActionState<InquiryState, FormData>(submitInquiry, {});
  const [closed, closeAction, closing] = useActionState<{ status?: string; error?: string }, FormData>(closeInquiry, {});

  if (state.id) {
    return (
      <div className="flex flex-col gap-3">
        <section className="rounded-2xl bg-sand/70 p-5">
          <p className="text-[12px] font-semibold text-ember">자동 답변</p>
          <p className="mt-1.5 text-[14px] leading-relaxed">{state.text}</p>
        </section>
        {closed.status ? (
          <p role="status" className="rounded-xl border border-line bg-white px-4 py-3 text-[14px]">
            {closed.status === "AUTO_RESOLVED" ? "해결되어 다행이에요. 다른 문의가 있으면 언제든 남겨 주세요." : "운영자에게 보냈어요. 답변이 오면 알림으로 알려 드릴게요."}
          </p>
        ) : (
          <form action={closeAction} className="flex gap-2">
            <input type="hidden" name="id" value={state.id} />
            <FieldError message={closed.error} />
            <button name="resolved" value="yes" disabled={closing} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-ink text-[14px] font-semibold text-cream disabled:opacity-50">해결됐어요</button>
            <button name="resolved" value="no" disabled={closing} className="flex h-12 flex-1 items-center justify-center rounded-xl border border-line bg-white text-[14px] disabled:opacity-50">운영자에게 보내기</button>
          </form>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <select name="category" defaultValue="PAYMENT_REFUND" aria-label="문의 유형" className={inputClass}>
        {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <textarea name="body" required maxLength={1000} rows={4} placeholder="궁금한 점을 적어 주세요" className={`${inputClass} h-auto py-3`} />
      <FieldError message={state.error} />
      <button disabled={pending} className={primaryButton}>{pending ? "확인 중…" : "문의하고 답변 보기"}</button>
    </form>
  );
}
