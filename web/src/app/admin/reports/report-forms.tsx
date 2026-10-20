"use client";

import { useActionState } from "react";
import { decideSanction, reviewReport, type ActionState } from "./actions";
import { Result, btnCls, ghostBtnCls, inputCls } from "../ui";

// Reports: take it, or close it with one of four outcomes. Restriction takes an end date.
export function ReportForm({ id, reviewing }: { id: string; reviewing: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(reviewReport, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-center gap-2 text-[12px] text-muted">제한 종료일
        <input type="date" name="until" className={inputCls} />
        <span>(비우면 30일)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {!reviewing && <button name="action" value="REVIEWING" disabled={pending} className={ghostBtnCls}>검토 중</button>}
        <button name="action" value="NONE" disabled={pending} className={ghostBtnCls}>조치 없음</button>
        <button name="action" value="WARNING" disabled={pending} className={ghostBtnCls}>경고</button>
        <button name="action" value="RESTRICTED" disabled={pending} className={btnCls}>참가 제한</button>
        <button name="action" value="BANNED" disabled={pending} className={btnCls}>이용 정지</button>
      </div>
      <Result state={state} />
    </form>
  );
}

// Sanctions the system proposed: confirm (restriction gets an end date) or reject.
export function SanctionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideSanction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-center gap-2 text-[12px] text-muted">제한 종료일
        <input type="date" name="until" className={inputCls} />
        <span>(비우면 30일)</span>
      </label>
      <div className="flex gap-2">
        <button name="decision" value="CONFIRM" disabled={pending} className={btnCls}>{pending ? "처리 중…" : "제재 확정"}</button>
        <button name="decision" value="REJECT" disabled={pending} className={ghostBtnCls}>반려</button>
      </div>
      <Result state={state} />
    </form>
  );
}
