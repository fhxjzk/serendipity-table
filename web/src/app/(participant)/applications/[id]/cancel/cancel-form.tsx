"use client";

import { useActionState, useState } from "react";
import { cancelOrNotify, type CancelState } from "./actions";
import { FieldError } from "@/components/participant-ui";

// Two steps on purpose: the first press reads the guidance back, the second one confirms.
export function CancelForm({ appId, mode, label }: { appId: string; mode: "cancel" | "absence"; label: string }) {
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelOrNotify, {});
  const [asking, setAsking] = useState(false);

  if (state.ok) return <p role="status" className="rounded-xl bg-sand/60 px-4 py-3 text-[14px] leading-relaxed">{state.ok}</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="app" value={appId} />
      <input type="hidden" name="mode" value={mode} />
      <FieldError message={state.error} />
      {asking ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setAsking(false)} className="flex h-12 flex-1 items-center justify-center rounded-xl border border-line bg-white text-[15px]">돌아가기</button>
          <button disabled={pending} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-ember text-[15px] font-semibold text-cream disabled:opacity-50">
            {pending ? "처리 중…" : "위 내용을 확인했어요"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className="flex h-12 items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-cream">{label}</button>
      )}
    </form>
  );
}
