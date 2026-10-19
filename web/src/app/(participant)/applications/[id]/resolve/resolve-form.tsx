"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Loader2, RotateCcw, Ticket } from "lucide-react";
import { primaryButton } from "@/components/participant-ui";
import { resolveFailure, type ResolveState } from "./actions";

export type OfferOption = { value: string; label: string; sub: string };

export function ResolveForm({ appId, offers, isSubscription, amount }: { appId: string; offers: OfferOption[]; isSubscription: boolean; amount: number }) {
  const [state, action, pending] = useActionState<ResolveState, FormData>(resolveFailure, {});
  const [choice, setChoice] = useState(offers.length ? "MOVE" : "KEEP");
  const [offer, setOffer] = useState(offers[0]?.value ?? "");

  const options = [
    ...(offers.length ? [{ value: "MOVE", icon: CalendarClock, title: "다른 일정으로 옮기기", body: "결제는 그대로 두고 아래 일정으로 신청을 옮겨요." }] : []),
    { value: "KEEP", icon: Ticket, title: "이용권으로 보관하기", body: "이번 결제를 1회 이용권으로 남겨 두고 다음에 써요." },
    {
      value: "REFUND", icon: RotateCcw, title: isSubscription ? "구독 횟수 돌려받기" : "환불받기",
      body: isSubscription ? "구독 이용권은 돈 대신 1회를 돌려드려요." : `${amount.toLocaleString()}원을 바로 환불해 드려요. (모의 환불)`,
    },
  ];

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="app" value={appId} />
      <input type="hidden" name="choice" value={choice} />
      <div className="flex flex-col gap-2">
        {options.map(({ value, icon: Icon, title, body }) => {
          const on = value === choice;
          return (
            <button type="button" key={value} onClick={() => setChoice(value)}
              className={`flex items-start gap-3 rounded-2xl border bg-white p-4 text-left transition ${on ? "border-ink ring-4 ring-ink/5" : "border-line"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${on ? "bg-ink text-cream" : "bg-sand text-ink/70"}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
              <span>
                <span className="block text-[15px] font-semibold">{title}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{body}</span>
              </span>
            </button>
          );
        })}
      </div>

      {choice === "MOVE" && (
        <fieldset className="rounded-2xl border border-line bg-white p-4">
          <legend className="px-1 text-[13px] font-semibold">옮길 일정</legend>
          <div className="mt-1 flex flex-col gap-1">
            {offers.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-paper">
                <input type="radio" name="offer" value={o.value} checked={offer === o.value} onChange={() => setOffer(o.value)} className="h-4 w-4 accent-[#2a211b]" />
                <span className="flex-1 text-[14px] font-medium">{o.label}</span>
                <span className="text-[12px] text-muted">{o.sub}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.error && <p role="alert" className="rounded-lg bg-ember/10 px-3 py-2 text-[13px] text-ember">{state.error}</p>}
      <button disabled={pending} className={primaryButton}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {choice === "MOVE" ? "이 일정으로 옮기기" : choice === "KEEP" ? "이용권으로 보관하기" : isSubscription ? "1회 돌려받기" : "환불받기"}
      </button>
    </form>
  );
}
