// S-22 회차 관리 (F-58): create a round and see what is scheduled.
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGION_LABEL, formatKst, todayKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls, thCls } from "../ui";
import { RoundForm } from "./round-form";

const STATUS: Record<string, { label: string; tone: "blue" | "green" | "gray" | "red" | "amber" }> = {
  DRAFT: { label: "준비", tone: "gray" }, OPEN: { label: "모집 중", tone: "blue" }, CLOSED: { label: "마감", tone: "amber" },
  MATCHED: { label: "매칭 완료", tone: "green" }, DONE: { label: "종료", tone: "gray" }, CANCELED: { label: "취소", tone: "red" },
};

export default async function RoundsPage() {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const { data: rounds } = await db.from("rounds")
    .select("id, title, event_date, start_at, apply_deadline_at, status, round_regions(region_code, capacity)")
    .gte("event_date", todayKst()).order("event_date");

  return (
    <main className="flex flex-col gap-8">
      <AdminHeader crumb="회차" title="회차 관리">
        행사 날짜와 지역을 정하면 신청 마감·자동 매칭·리마인드 시각과 파트너 식당 재고가 한 번에 만들어져요.
      </AdminHeader>
      <RoundForm />
      <section className={cardCls}>
        <table className="w-full text-[13px] tabular">
          <thead className="border-b border-line bg-paper text-left text-[12px] text-muted">
            <tr><th className={thCls}>회차</th><th className={thCls}>상태</th><th className={thCls}>행사 시작</th><th className={thCls}>신청 마감</th><th className={thCls}>지역(정원)</th></tr>
          </thead>
          <tbody>
            {(rounds ?? []).map((r) => (
              <tr key={r.id} className="border-t border-line/70">
                <td className="px-4 py-3 font-medium">{r.title}</td>
                <td className="px-4 py-3"><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                <td className="px-4 py-3">{formatKst(r.start_at)}</td>
                <td className="px-4 py-3">{formatKst(r.apply_deadline_at)}</td>
                <td className="px-4 py-3 text-muted">
                  {((r.round_regions ?? []) as { region_code: string; capacity: number }[]).filter((x) => x.region_code !== "ETC").map((x) => `${REGION_LABEL[x.region_code]} ${x.capacity}`).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rounds?.length && <Empty>예정된 회차가 없어요.</Empty>}
      </section>
    </main>
  );
}
