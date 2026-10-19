"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { primaryButton } from "@/components/participant-ui";
import { submitFeedback, type EventState } from "../event-actions";

export type Mate = { profileId: string; name: string; ageBand: string };

const QUESTIONS: [string, string][] = [
  ["mood", "테이블 분위기는 어땠나요?"], ["talk", "대화는 즐거웠나요?"], ["venue", "식당은 만족스러웠나요?"],
  ["rejoin", "다시 참여하고 싶나요?"], ["recommend", "친구에게 추천하고 싶나요?"],
];
const REPORT_REASONS: [string, string][] = [["HARASSMENT", "불쾌한 언행"], ["NO_MANNER", "비매너"], ["SALES", "영업·권유"], ["ETC", "기타"]];

function Scale({ name }: { name: string }) {
  const [v, setV] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={`flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border text-[14px] font-semibold transition ${v === n ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/70"}`}>
          <input type="radio" name={name} value={n} checked={v === n} onChange={() => setV(n)} className="sr-only" />{n}
        </label>
      ))}
    </div>
  );
}

export function FeedbackForm({ appId, mates }: { appId: string; mates: Mate[] }) {
  const [state, action, pending] = useActionState<EventState, FormData>(submitFeedback, {});
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="app" value={appId} />

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-[15px] font-bold">만족도</h2>
        <p className="mt-1 text-[12px] text-muted">1점(아쉬워요) ~ 5점(최고예요)</p>
        <div className="mt-4 flex flex-col gap-4">
          {QUESTIONS.map(([k, q]) => (
            <div key={k}><p className="mb-2 text-[13px] font-medium">{q}</p><Scale name={k} /></div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-[15px] font-bold">함께한 사람</h2>
        <p className="mt-1 text-[12px] text-muted">고른 내용은 상대에게 알리지 않아요. 다음 매칭에만 반영돼요.</p>
        <ul className="mt-4 flex flex-col gap-4">
          {mates.map((m) => (
            <li key={m.profileId} className="rounded-xl bg-paper p-3">
              <input type="hidden" name="mate" value={m.profileId} />
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">{m.name} <span className="font-normal text-muted">{m.ageBand}</span></span>
                <label className="flex items-center gap-1.5 text-[12px] text-muted">
                  <input type="checkbox" name={`ate:${m.profileId}`} defaultChecked className="h-4 w-4 accent-[#2a211b]" />함께 식사함
                </label>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-[12px]">
                {[["LIKE", "다시 만나고 싶어요"], ["NONE", "상관없어요"], ["DISLIKE", "다음엔 다른 분과"]].map(([v, label]) => (
                  <label key={v} className="cursor-pointer">
                    <input type="radio" name={`pref:${m.profileId}`} value={v} defaultChecked={v === "NONE"} className="peer sr-only" />
                    <span className="flex h-9 items-center justify-center rounded-lg border border-line bg-white px-1 text-center peer-checked:border-ink peer-checked:bg-ink peer-checked:text-cream">{label}</span>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-[15px] font-bold">공개 후기 (선택)</h2>
        <p className="mt-1 text-[12px] text-muted">다른 참가자를 언급하지 말아 주세요. 운영자가 숨길 수 있어요.</p>
        <select name="reviewRating" defaultValue="" className="mt-3 h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px]">
          <option value="">별점 선택 안 함</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
        </select>
        <input name="reviewText" maxLength={100} placeholder="한 줄 후기 (100자)" className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14px]" />
        <label className="mt-2 flex items-center gap-2 text-[13px]"><input type="checkbox" name="reviewPublic" className="h-4 w-4 accent-[#2a211b]" />공개 후기로 보여 줘도 괜찮아요</label>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <button type="button" onClick={() => setReportOpen((o) => !o)} className="text-[13px] font-semibold text-ember underline underline-offset-4">불편한 일이 있었나요? 신고하기</button>
        {reportOpen && (
          <div className="mt-3 flex flex-col gap-2">
            <select name="reportTarget" defaultValue="" className="h-11 rounded-xl border border-line bg-white px-3 text-[14px]">
              <option value="">신고할 사람 선택</option>
              {mates.map((m) => <option key={m.profileId} value={m.profileId}>{m.name}</option>)}
            </select>
            <select name="reportReason" defaultValue="HARASSMENT" className="h-11 rounded-xl border border-line bg-white px-3 text-[14px]">
              {REPORT_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea name="reportDetail" maxLength={1000} rows={3} placeholder="어떤 일이 있었는지 적어 주세요. 상대에게 공개되지 않아요." className="rounded-xl border border-line bg-white p-3 text-[14px]" />
            <p className="text-[11px] text-muted">신고하면 그 사람과는 다시 같은 식탁에 배정되지 않아요.</p>
          </div>
        )}
      </section>

      {state.error && <p role="alert" className="rounded-lg bg-ember/10 px-3 py-2 text-[13px] text-ember">{state.error}</p>}
      <button disabled={pending} className={primaryButton}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}피드백 보내기</button>
    </form>
  );
}
