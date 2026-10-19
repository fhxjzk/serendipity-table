"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { primaryButton } from "@/components/participant-ui";
import { objectNoshow, type EventState } from "../event-actions";

export function NoshowForm({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<EventState, FormData>(objectNoshow, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="app" value={appId} />
      <textarea name="text" rows={4} maxLength={500} placeholder="예: 19시에 도착해서 함께 식사했는데 체크인을 깜빡했어요." className="rounded-xl border border-line bg-white p-3 text-[14px]" />
      {state.error && <p role="alert" className="text-[13px] text-ember">{state.error}</p>}
      <button disabled={pending} className={primaryButton}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}참석했어요 · 이의 제기</button>
    </form>
  );
}
