"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { primaryButton } from "@/components/participant-ui";
import { submitApplication, type ApplyState } from "./actions";

export type RoundOption = { id: string; dateLabel: string; timeLabel: string; deadlineLabel: string; regions: string[] };
export type RegionOption = { code: string; label: string };

export function RoundsForm({ rounds, regions }: { rounds: RoundOption[]; regions: RegionOption[] }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(submitApplication, {});
  const [picked, setPicked] = useState<string[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const pairs = rounds.filter((r) => picked.includes(r.id)).reduce((n, r) => n + r.regions.filter((g) => picks.includes(g)).length, 0);

  return (
    <form action={action} className="flex flex-col gap-6">
      <section>
        <h2 className="text-[15px] font-bold">참가 가능한 날짜</h2>
        <p className="mt-1 text-[12px] text-muted">여러 날짜를 고르면 자리가 나는 날짜로 배정돼요.</p>
        <div className="mt-3 flex flex-col gap-2">
          {rounds.map((r) => {
            const on = picked.includes(r.id);
            return (
              <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white p-4 transition ${on ? "border-ink ring-4 ring-ink/5" : "border-line"}`}>
                <input type="checkbox" name="rounds" value={r.id} checked={on} onChange={() => toggle(picked, setPicked, r.id)} className="sr-only" />
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-ink bg-ink text-cream" : "border-line"}`}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">{r.dateLabel} <span className="font-normal text-muted">{r.timeLabel}</span></span>
                  <span className="block text-[12px] text-muted">신청 마감 {r.deadlineLabel}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-bold">희망 지역</h2>
        <p className="mt-1 text-[12px] text-muted">고른 지역 안에서만 테이블을 찾아요.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {regions.map((g) => {
            const on = picks.includes(g.code);
            return (
              <label key={g.code} className={`flex cursor-pointer items-center justify-center rounded-xl border py-3 text-[14px] transition ${on ? "border-ink bg-ink font-semibold text-cream" : "border-line bg-white text-ink/80"}`}>
                <input type="checkbox" name="regions" value={g.code} checked={on} onChange={() => toggle(picks, setPicks, g.code)} className="sr-only" />
                {g.label}
              </label>
            );
          })}
        </div>
      </section>

      {state.error && <p role="alert" className="rounded-lg bg-ember/10 px-3 py-2 text-[13px] text-ember">{state.error}</p>}
      <div className="sticky bottom-0 -mx-5 border-t border-line bg-paper/95 px-5 pb-6 pt-3 backdrop-blur">
        <p className="mb-2 text-center text-[12px] text-muted tabular">
          {pairs > 0 ? `날짜 ${picked.length}개 · 지역 ${picks.length}곳 (선택지 ${pairs}개)` : "날짜와 지역을 골라 주세요"}
        </p>
        <button disabled={pending || pairs === 0} className={primaryButton}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          신청하고 결제하기
        </button>
      </div>
    </form>
  );
}
