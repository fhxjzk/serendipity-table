"use client";

import { useActionState, useState } from "react";
import { resetRound, runNow, type ActionState } from "./actions";

export function RunNowButton({ roundId, disabled }: { roundId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(runNow, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="roundId" value={roundId} />
      <button disabled={disabled || pending} className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-cream hover:bg-espresso disabled:opacity-40">
        {pending ? "매칭 중…" : "즉시 실행"}
      </button>
      <Result state={state} />
    </form>
  );
}

// Two-step: the first click asks, the second one resets.
export function ResetButton({ roundId }: { roundId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resetRound, {});
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="roundId" value={roundId} />
      {asking && !pending ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink/70">테이블·실패 처리·쿠폰을 지우고 되돌릴까요?</span>
          <button type="button" onClick={() => setAsking(false)} className="text-xs text-ink/60 underline">취소</button>
          <button className="rounded-lg bg-espresso px-3.5 py-2 text-[13px] font-semibold text-cream">되돌리기 확인</button>
        </div>
      ) : (
        <button type="button" disabled={pending} onClick={() => setAsking(true)} className="rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-paper disabled:opacity-40">
          {pending ? "되돌리는 중…" : "되돌리기"}
        </button>
      )}
      <Result state={state} />
    </form>
  );
}

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="max-w-xs text-right text-xs text-red-600">{state.error}</p>;
  if (state.ok) return <p className="max-w-xs text-right text-xs text-[#4f6b3a]">{state.ok}</p>;
  return null;
}
