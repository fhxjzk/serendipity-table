"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { primaryButton } from "@/components/participant-ui";
import { pay, type PayState } from "./actions";

export type PayOption = { value: string; title: string; sub: string; price: number; badge?: string };

export function PaymentForm({ appId, options, discountRate }: { appId: string; options: PayOption[]; discountRate: number }) {
  const [state, action, pending] = useActionState<PayState, FormData>(pay, {});
  const [choice, setChoice] = useState(options[0]?.value ?? "");
  const selected = options.find((o) => o.value === choice);
  const discount = selected && !selected.value.startsWith("TICKET:") ? Math.round((selected.price * discountRate) / 100) : 0;
  const total = selected ? (selected.value.startsWith("TICKET:") ? 0 : selected.price - discount) : 0;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="app" value={appId} />
      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const on = o.value === choice;
          return (
            <label key={o.value} className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white p-4 transition ${on ? "border-ink ring-4 ring-ink/5" : "border-line"}`}>
              <input type="radio" name="option" value={o.value} checked={on} onChange={() => setChoice(o.value)} className="h-4 w-4 accent-[#2a211b]" />
              <span className="flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  {o.title}
                  {o.badge && <span className="rounded-md bg-ember/10 px-1.5 py-0.5 text-[11px] font-semibold text-ember">{o.badge}</span>}
                </span>
                <span className="block text-[12px] text-muted">{o.sub}</span>
              </span>
              <span className="text-[15px] font-semibold tabular">{o.value.startsWith("TICKET:") ? "1회 차감" : `${o.price.toLocaleString()}원`}</span>
            </label>
          );
        })}
      </div>

      <dl className="rounded-2xl border border-line bg-white p-5 text-[14px] tabular">
        <div className="flex justify-between"><dt className="text-muted">상품 금액</dt><dd>{selected?.value.startsWith("TICKET:") ? "보유 이용권" : `${(selected?.price ?? 0).toLocaleString()}원`}</dd></div>
        {discount > 0 && <div className="mt-2 flex justify-between text-ember"><dt>보상 쿠폰 {discountRate}%</dt><dd>-{discount.toLocaleString()}원</dd></div>}
        <div className="mt-3 flex justify-between border-t border-line pt-3 text-[16px] font-bold"><dt>결제 금액</dt><dd>{total.toLocaleString()}원</dd></div>
      </dl>

      {state.error && <p role="alert" className="rounded-lg bg-ember/10 px-3 py-2 text-[13px] text-ember">{state.error}</p>}
      <button disabled={pending || !selected} className={primaryButton}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "결제 중" : total > 0 ? `${total.toLocaleString()}원 결제하기` : "이용권으로 신청 완료하기"}
      </button>
      <p className="-mt-2 text-center text-[11px] text-muted">시연용 모의 결제예요. 실제로 돈이 나가지 않아요.</p>
    </form>
  );
}
