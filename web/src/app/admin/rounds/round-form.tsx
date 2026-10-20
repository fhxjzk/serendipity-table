"use client";

import { useActionState } from "react";
import { createRound, updateRound, type ActionState } from "./actions";
import { Result, btnCls, cardCls, inputCls } from "../ui";

const REGIONS = [
  ["HONGDAE", "홍대/합정"], ["GANGNAM", "강남/신논현"], ["EULJIRO", "을지로/종로"], ["JAMSIL", "잠실"],
] as const;

const LABEL: Record<string, string> = Object.fromEntries(REGIONS);

export function RoundEditForm({ round }: { round: { id: string; title: string; start: string; end: string; regions: { region_code: string; capacity: number }[] } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateRound, {});
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={round.id} />
      <input name="title" defaultValue={round.title} aria-label="회차 이름" className={`${inputCls} w-44`} />
      <input type="time" name="start_time" defaultValue={round.start} aria-label="시작" className={inputCls} />
      <input type="time" name="end_time" defaultValue={round.end} aria-label="종료" className={inputCls} />
      {round.regions.map((r) => (
        <label key={r.region_code} className="flex items-center gap-1 text-[12px] text-muted">
          {LABEL[r.region_code] ?? r.region_code}
          <input type="number" name={`capacity_${r.region_code}`} defaultValue={r.capacity} min={0} max={1000} className={`${inputCls} w-16`} />
        </label>
      ))}
      <button disabled={pending} className={btnCls}>{pending ? "저장 중…" : "저장"}</button>
      <Result state={state} />
    </form>
  );
}

export function RoundForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createRound, {});
  return (
    <form action={action} className={`${cardCls} flex flex-col gap-5 p-5`}>
      <h2 className="text-[15px] font-bold">새 회차 만들기</h2>
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] text-muted">행사 날짜
          <input type="date" name="event_date" required className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">시작
          <input type="time" name="start_time" defaultValue="19:00" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">종료
          <input type="time" name="end_time" defaultValue="21:00" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">식당당 테이블 수
          <input type="number" name="table_slots" min={1} max={20} defaultValue={4} className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[12px] text-muted">회차 이름 (비우면 날짜로 자동 생성)
        <input name="title" maxLength={60} placeholder="예: 11/12(목) 우연한 식탁" className={inputCls} />
      </label>
      <fieldset>
        <legend className="text-[12px] text-muted">모집 지역과 정원</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {REGIONS.map(([code, label]) => (
            <label key={code} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px]">
              <input type="checkbox" name="region" value={code} defaultChecked />
              <span className="flex-1">{label}</span>
              <input type="number" name={`capacity_${code}`} min={0} max={1000} defaultValue={60} aria-label={`${label} 정원`} className={`${inputCls} w-20`} />
              <span className="text-[12px] text-muted">명</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-[12px] text-muted">신청 마감과 자동 매칭은 행사 3일 전 18시, 전날 리마인드는 전날 18시로 정해져요. 선택한 지역의 파트너 식당 재고가 함께 만들어져요.</p>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={btnCls}>{pending ? "만드는 중…" : "회차 만들기"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}
