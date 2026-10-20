"use client";

import { useActionState } from "react";
import { answerInquiry, handleException, type ActionState } from "./actions";
import { Result, btnCls, ghostBtnCls, inputCls } from "../ui";

// An escalated inquiry is closed by answering it, not by a plain "해결".
export function InquiryAnswerForm({ inquiryId }: { inquiryId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(answerInquiry, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="inquiry" value={inquiryId} />
      <textarea name="answer" required maxLength={1000} rows={3} placeholder="참가자에게 보낼 답변" className="w-72 rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40" />
      <button disabled={pending} className={btnCls}>{pending ? "보내는 중…" : "답변 보내기"}</button>
      <Result state={state} />
    </form>
  );
}

export function ExceptionForm({ id, needsVerdict, inProgress }: { id: string; needsVerdict: boolean; inProgress: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(handleException, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="note" maxLength={500} placeholder="처리 메모(선택)" className={`${inputCls} w-64`} />
      {needsVerdict && (
        <select name="verdict" defaultValue="" className={inputCls} aria-label="이의 제기 판단">
          <option value="">판단 선택</option>
          <option value="ACCEPT">참석 인정(노쇼 취소)</option>
          <option value="REJECT">노쇼 유지(패널티 적용)</option>
        </select>
      )}
      <div className="flex gap-2">
        {!inProgress && <button name="status" value="IN_PROGRESS" disabled={pending} className={ghostBtnCls}>처리 중</button>}
        <button name="status" value="RESOLVED" disabled={pending} className={btnCls}>{pending ? "처리 중…" : "해결"}</button>
      </div>
      <Result state={state} />
    </form>
  );
}
