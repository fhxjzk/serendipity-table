"use client";

import { useActionState } from "react";
import { saveSlots, saveVenue, type ActionState } from "./actions";
import { Result, btnCls, ghostBtnCls, inputCls } from "../ui";

type Venue = { id?: string; name?: string; region_code?: string; address?: string; price_range?: string | null; map_url?: string | null };
const REGIONS = [["HONGDAE", "홍대/합정"], ["GANGNAM", "강남/신논현"], ["EULJIRO", "을지로/종로"], ["JAMSIL", "잠실"]] as const;

export function VenueForm({ venue, prices }: { venue?: Venue; prices: { code: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveVenue, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {venue?.id && <input type="hidden" name="id" value={venue.id} />}
      <input name="name" defaultValue={venue?.name} placeholder="식당 이름" aria-label="식당 이름" className={`${inputCls} w-36`} />
      <select name="region_code" defaultValue={venue?.region_code ?? ""} aria-label="지역" className={inputCls}>
        <option value="">지역</option>
        {REGIONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
      </select>
      <input name="address" defaultValue={venue?.address} placeholder="주소" aria-label="주소" className={`${inputCls} w-56`} />
      <select name="price_range" defaultValue={venue?.price_range ?? ""} aria-label="가격대" className={inputCls}>
        <option value="">가격대</option>
        {prices.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
      </select>
      <input name="map_url" defaultValue={venue?.map_url ?? ""} placeholder="지도 링크(비우면 자동)" aria-label="지도 링크" className={`${inputCls} w-48`} />
      <button disabled={pending} className={venue?.id ? ghostBtnCls : btnCls}>{pending ? "저장 중…" : venue?.id ? "저장" : "식당 등록"}</button>
      <Result state={state} />
    </form>
  );
}

export function SlotForm({ id, slots, seats }: { id: string; slots: number; seats: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSlots, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="number" name="table_slots" defaultValue={slots} min={0} max={50} aria-label="테이블 수" className={`${inputCls} w-16`} />
      <span className="text-xs text-muted">개 · 최대</span>
      <input type="number" name="max_seats" defaultValue={seats} min={4} max={12} aria-label="최대 인원" className={`${inputCls} w-16`} />
      <span className="text-xs text-muted">명</span>
      <button disabled={pending} className={ghostBtnCls}>저장</button>
      <Result state={state} />
    </form>
  );
}
