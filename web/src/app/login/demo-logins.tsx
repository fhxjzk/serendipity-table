"use client";

import { useActionState } from "react";
import { demoLogin, type DemoKind, type LoginState } from "./actions";

const LABEL: Record<DemoKind, [string, string]> = {
  new: ["새로 신청할 참가자", "추천·신청·결제"],
  waiting: ["매칭 대기 참가자", "결제 완료·결과 기다리는 중"],
  table: ["확정된 참가자", "식탁·단체방·체크인"],
  fail: ["매칭 실패 참가자", "일정 이동·보관·환불"],
  admin: ["운영자", "매칭 모니터·예외 처리"],
};

export function DemoLogins({ kinds }: { kinds: DemoKind[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(demoLogin, {});
  if (!kinds.length) return null;
  return (
    <div className="mt-8 border-t border-line pt-5">
      <p className="text-[13px] font-semibold text-ink/80">테스트 계정으로 바로 둘러보기</p>
      <form action={action} className="mt-3 grid grid-cols-2 gap-2">
        {kinds.map((k, i) => (
          <button key={k} name="kind" value={k} disabled={pending}
            className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition hover:border-ink/30 disabled:opacity-50 ${k === "admin" ? "border-ink/20 bg-sand/60" : "border-line bg-white"} ${i === kinds.length - 1 && kinds.length % 2 === 1 ? "col-span-2" : ""}`}>
            <span className="text-[13px] font-semibold">{LABEL[k][0]}</span>
            <span className="mt-0.5 text-[11px] text-muted">{LABEL[k][1]}</span>
          </button>
        ))}
      </form>
      {state.error && <p role="alert" className="mt-2 text-[12px] text-ember">{state.error}</p>}
    </div>
  );
}
