"use client";

import { useActionState } from "react";
import { demoLogin, type DemoKind, type LoginState } from "./actions";

const LABEL: Record<DemoKind, [string, string]> = {
  new: ["새로 신청할 참가자", "추천·신청·결제"],
  waiting: ["매칭 대기 참가자", "결제 완료·결과 기다리는 중"],
  table: ["확정된 참가자", "식탁·단체방·체크인"],
  mate: ["같은 식탁 참가자", "다른 창에서 실시간 채팅"],
  fail: ["매칭 실패 참가자", "일정 이동·보관·환불"],
  admin: ["운영자", "매칭 모니터·예외 처리"],
};

export function DemoLogins({ kinds }: { kinds: DemoKind[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(demoLogin, {});
  if (!kinds.length) return null;
  return (
    <div className="mt-5 border-t border-cream/10 pt-4">
      <p className="text-[13px] font-semibold text-cream/80">테스트 계정으로 바로 둘러보기</p>
      <form action={action} className="mt-2.5 grid grid-cols-2 gap-2">
        {kinds.map((k, i) => (
          <button key={k} name="kind" value={k} disabled={pending}
            className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition hover:border-gold/50 disabled:opacity-50 ${k === "admin" ? "border-gold/30 bg-gold/10" : "border-cream/12 bg-cream/[0.04]"} ${i === kinds.length - 1 && kinds.length % 2 === 1 ? "col-span-2" : ""}`}>
            <span className="text-[13px] font-semibold">{LABEL[k][0]}</span>
            <span className="mt-0.5 text-[11px] text-cream/50">{LABEL[k][1]}</span>
          </button>
        ))}
      </form>
      {state.error && <p role="alert" className="mt-2 text-[12px] text-[#f3c4ab]">{state.error}</p>}
    </div>
  );
}
