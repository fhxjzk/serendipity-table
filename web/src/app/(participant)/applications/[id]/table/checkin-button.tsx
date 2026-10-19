"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, MapPinCheck } from "lucide-react";
import { primaryButton } from "@/components/participant-ui";
import { checkIn, type EventState } from "../event-actions";

export function CheckInButton({ appId, done }: { appId: string; done: boolean }) {
  const [state, action, pending] = useActionState<EventState, FormData>(checkIn, {});
  if (done || state.ok) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-[14px] font-semibold text-emerald-800">
        <CheckCircle2 className="h-4 w-4" />{state.ok ?? "체크인 완료"}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="app" value={appId} />
      <button disabled={pending} className={`${primaryButton} bg-ember hover:bg-ember`}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinCheck className="h-4 w-4" />}
        도착했어요 · 체크인
      </button>
      {state.error && <p className="text-center text-[12px] text-ember">{state.error}</p>}
    </form>
  );
}
