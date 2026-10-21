// S-23 식당·재고 관리 (F-59): partner venues, and how many tables each offers per round.
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGION_LABEL, todayKst } from "@/lib/format";
import { AdminHeader, Badge, cardCls, thCls } from "../ui";
import { RoundPicker } from "../round-picker";
import { toggleVenue } from "./actions";
import { SlotForm, VenueForm } from "./forms";

type Venue = { id: string; name: string; region_code: string; address: string; price_range: string | null; map_url: string | null; active: boolean };

export default async function VenuesPage({ searchParams }: PageProps<"/admin/venues">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const sp = await searchParams;
  const [{ data: venues }, { data: prices }, { data: rounds }] = await Promise.all([
    db.from("venues").select("id, name, region_code, address, price_range, map_url, active").order("region_code").order("name"),
    db.from("code_values").select("code, label").eq("code_group", "PRICE_RANGE").order("sort_order"),
    db.from("rounds").select("id, title, status, event_date").gte("event_date", todayKst()).neq("status", "CANCELED").order("event_date"),
  ]);
  const roundId = (typeof sp.round === "string" && sp.round) || rounds?.[0]?.id || "";
  const { data: slots } = roundId
    ? await db.from("venue_availability").select("id, venue_id, table_slots, max_seats, booked_slots").eq("round_id", roundId)
    : { data: [] };
  const priceLabel = (c: string | null) => prices?.find((p) => p.code === c)?.label ?? "-";

  return (
    <main className="flex flex-col gap-8">
      <AdminHeader crumb="식당" title="식당·재고 관리">
        파트너 식당을 등록하고, 회차마다 받을 수 있는 테이블 수와 최대 인원을 정해요. 확정된 테이블은 이 재고 안에서 자동으로 식당이 배정돼요.
      </AdminHeader>

      <section className={`${cardCls} p-5`}>
        <h2 className="mb-3 text-[15px] font-bold">새 식당 등록</h2>
        <VenueForm prices={prices ?? []} />
      </section>

      <section className={cardCls}>
        <h2 className="border-b border-line bg-paper px-4 py-2.5 text-[13px] font-bold">파트너 식당 {venues?.length ?? 0}곳</h2>
        <table className="w-full text-[13px]">
          <tbody>
            {((venues ?? []) as Venue[]).map((v) => (
              <tr key={v.id} className={`border-t border-line/70 align-top ${v.active ? "" : "opacity-60"}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2"><span className="font-medium">{v.name}</span><Badge tone={v.active ? "green" : "gray"}>{v.active ? "운영 중" : "중지"}</Badge></div>
                  <p className="mt-1 text-[12px] text-muted">{REGION_LABEL[v.region_code]} · {v.address} · {priceLabel(v.price_range)}</p>
                </td>
                <td className="px-4 py-3"><VenueForm venue={v} prices={prices ?? []} /></td>
                <td className="px-4 py-3">
                  <form action={toggleVenue}>
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="active" value={v.active ? "false" : "true"} />
                    <button className="text-[12px] text-ink/60 underline">{v.active ? "운영 중지" : "다시 운영"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-[15px] font-bold">회차별 재고</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {roundId && <RoundPicker rounds={rounds ?? []} current={roundId} basePath="/admin/venues" />}
        </div>
        <div className={`${cardCls} mt-3`}>
          <table className="w-full text-[13px] tabular">
            <thead className="border-b border-line bg-paper text-left text-[12px] text-muted">
              <tr><th className={thCls}>식당</th><th className={thCls}>예약됨</th><th className={thCls}>테이블 수 · 최대 인원</th></tr>
            </thead>
            <tbody>
              {((venues ?? []) as Venue[]).map((v) => {
                const s = (slots ?? []).find((x) => x.venue_id === v.id);
                return (
                  <tr key={v.id} className="border-t border-line/70">
                    <td className="px-4 py-2.5"><span className="font-medium">{v.name}</span> <span className="text-[12px] text-muted">{REGION_LABEL[v.region_code]}</span></td>
                    <td className="px-4 py-2.5">{s ? `${s.booked_slots} / ${s.table_slots}` : "-"}</td>
                    <td className="px-4 py-2.5">{s ? <SlotForm id={s.id} slots={s.table_slots} seats={s.max_seats} /> : <span className="text-[12px] text-muted">이 회차 지역이 아니에요</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
