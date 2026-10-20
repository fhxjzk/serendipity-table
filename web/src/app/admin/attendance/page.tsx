// S-29 참석·취소·노쇼 현황 (F-67): who checked in, cancelled early or late, or is a no-show (candidate), per round.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls, thCls } from "../ui";

const STATE: Record<string, { label: string; tone: "green" | "blue" | "amber" | "red" | "gray" }> = {
  ATTENDED: { label: "체크인", tone: "green" },
  SCHEDULED: { label: "참석 예정", tone: "blue" },
  CANCELED_EARLY: { label: "사전 취소", tone: "gray" },
  CANCELED_LATE: { label: "늦은·당일 취소", tone: "amber" },
  NOSHOW_PENDING: { label: "노쇼 후보", tone: "red" },
  NOSHOW_ESCALATED: { label: "노쇼 이의 제기", tone: "amber" },
  NO_SHOW: { label: "노쇼 확정", tone: "red" },
};
type Row = { id: string; profile_id: string; attendance_status: string; match_status: string; checked_in_at: string | null; reason_code: string | null; profiles: { name: string } | { name: string }[] | null };

export default async function AttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const sp = await searchParams;
  const { data: rounds } = await db.from("rounds").select("id, title, status, event_date").in("status", ["MATCHED", "DONE"]).order("event_date", { ascending: false }).limit(8);
  const roundId = (typeof sp.round === "string" && sp.round) || rounds?.[0]?.id || "";

  const { data: choices } = roundId ? await db.from("application_choices").select("application_id").eq("round_id", roundId) : { data: [] };
  const ids = [...new Set((choices ?? []).map((c) => c.application_id))];
  const { data: apps } = ids.length
    ? await db.from("applications").select("id, profile_id, attendance_status, match_status, checked_in_at, reason_code, profiles(name)").in("id", ids)
    : { data: [] };
  const { data: cases } = ids.length ? await db.from("noshow_cases").select("application_id, result").in("application_id", ids) : { data: [] };

  // Everyone who held a seat at some point, or cancelled it.
  const rows = ((apps ?? []) as Row[]).filter((a) => a.match_status === "CONFIRMED" || a.attendance_status !== "SCHEDULED" || ["TABLE_CANCELED", "REALLOC_FAILED"].includes(a.reason_code ?? ""));
  const stateOf = (a: Row) => {
    const c = (cases ?? []).find((x) => x.application_id === a.id);
    if (c?.result === "PENDING") return "NOSHOW_PENDING";
    if (c?.result === "ESCALATED") return "NOSHOW_ESCALATED";
    return a.attendance_status;
  };
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(stateOf(r), (counts.get(stateOf(r)) ?? 0) + 1);
  const order = Object.keys(STATE);
  rows.sort((a, b) => order.indexOf(stateOf(a)) - order.indexOf(stateOf(b)));

  return (
    <main className="flex flex-col gap-6">
      <AdminHeader crumb="참석" title="참석·취소·노쇼 현황">회차별로 체크인, 사전 취소, 늦은·당일 취소, 노쇼 후보와 확정을 확인하고 이름을 누르면 그 사람의 이력을 볼 수 있어요.</AdminHeader>
      <div className="flex flex-wrap gap-2">
        {(rounds ?? []).map((r) => (
          <Link key={r.id} href={`/admin/attendance?round=${r.id}`} className={`rounded-full border px-3 py-1.5 text-[13px] ${r.id === roundId ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/80 hover:bg-paper"}`}>{r.title}</Link>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {order.map((k) => (
          <div key={k} className={`${cardCls} p-4`}><p className="text-[12px] text-muted">{STATE[k].label}</p><p className="mt-1 text-[22px] font-bold tabular">{counts.get(k) ?? 0}</p></div>
        ))}
      </div>
      <section className={cardCls}>
        <table className="w-full text-[13px] tabular">
          <thead className="border-b border-line bg-paper text-left text-[12px] text-muted"><tr><th className={thCls}>참가자</th><th className={thCls}>상태</th><th className={thCls}>체크인 시각</th></tr></thead>
          <tbody>
            {rows.map((a) => {
              const s = STATE[stateOf(a)] ?? { label: stateOf(a), tone: "gray" as const };
              const p = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
              return (
                <tr key={a.id} className="border-t border-line/70">
                  <td className="px-4 py-2.5"><Link href={`/admin/people/${a.profile_id}`} className="font-medium underline-offset-2 hover:underline">{p?.name}</Link></td>
                  <td className="px-4 py-2.5"><Badge tone={s.tone}>{s.label}</Badge>{a.reason_code === "TABLE_CANCELED" && <span className="ml-2 text-[12px] text-muted">테이블 취소로 환불</span>}</td>
                  <td className="px-4 py-2.5 text-muted">{formatKst(a.checked_in_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <Empty>이 회차에는 아직 확정된 참가자가 없어요.</Empty>}
      </section>
    </main>
  );
}
