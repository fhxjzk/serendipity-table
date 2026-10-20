// S-26 예외 처리함 (F-66): what the automation could not settle, for the operator to close.
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls } from "../ui";
import { ExceptionForm } from "./exception-form";

const TYPE: Record<string, string> = {
  PAYMENT_ERROR: "결제 오류", DATA_MISSING: "데이터 누락", VENUE_SHORTAGE: "식당 재고 부족", CONDITION_CONFLICT: "조건 충돌",
  MATCH_FAILED_ALL: "전원 매칭 실패", DELIVERY_FAILED: "안내 발송 실패", REFUND_FAILED: "환불 실패", NOSHOW_OBJECTION: "노쇼 이의 제기", INQUIRY: "문의",
};
const STATUS: Record<string, { label: string; tone: "red" | "amber" | "green" }> = {
  OPEN: { label: "대기", tone: "red" }, IN_PROGRESS: { label: "처리 중", tone: "amber" }, RESOLVED: { label: "해결", tone: "green" },
};
type Exc = {
  id: string; type: string; status: string; round_id: string | null; application_id: string | null; reason: string;
  detail: Record<string, unknown> | null; resolution_note: string | null; created_at: string; resolved_at: string | null;
};
type AppRow = { id: string; profiles: { name: string } | { name: string }[] | null };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function ExceptionsPage() {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const [{ data: open }, { data: done }] = await Promise.all([
    db.from("exceptions").select("*").neq("status", "RESOLVED").order("created_at"),
    db.from("exceptions").select("*").eq("status", "RESOLVED").order("resolved_at", { ascending: false }).limit(10),
  ]);
  const all = [...(open ?? []), ...(done ?? [])] as Exc[];

  const appIds = [...new Set(all.map((e) => e.application_id).filter(Boolean))] as string[];
  const roundIds = [...new Set(all.map((e) => e.round_id).filter(Boolean))] as string[];
  const [{ data: apps }, { data: rounds }] = await Promise.all([
    appIds.length ? db.from("applications").select("id, profiles(name)").in("id", appIds) : { data: [] },
    roundIds.length ? db.from("rounds").select("id, title").in("id", roundIds) : { data: [] },
  ]);
  const nameOf = (id: string | null) => one(((apps ?? []) as AppRow[]).find((a) => a.id === id)?.profiles)?.name;
  const roundOf = (id: string | null) => ((rounds ?? []) as { id: string; title: string }[]).find((r) => r.id === id)?.title;

  const Row = ({ e }: { e: Exc }) => {
    const text = typeof e.detail?.text === "string" ? e.detail.text : null;
    return (
      <tr className="border-t border-line/70 align-top">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2"><Badge tone={STATUS[e.status]?.tone}>{STATUS[e.status]?.label}</Badge><span className="font-medium">{TYPE[e.type] ?? e.type}</span></div>
          <p className="mt-1 text-[12px] text-muted">{[roundOf(e.round_id), nameOf(e.application_id)].filter(Boolean).join(" · ") || "-"}</p>
        </td>
        <td className="px-4 py-3">
          <p>{e.reason}</p>
          {text && <p className="mt-1 max-w-md rounded-lg bg-sand/50 px-3 py-2 text-[12px] leading-relaxed text-ink/80">“{text}”</p>}
          {e.resolution_note && <p className="mt-1 text-[12px] text-muted">처리 메모: {e.resolution_note}</p>}
        </td>
        <td className="px-4 py-3 text-[12px] text-muted tabular">{formatKst(e.created_at)}</td>
        <td className="px-4 py-3">
          {e.status === "RESOLVED"
            ? <span className="text-[12px] text-muted">{formatKst(e.resolved_at)} 해결</span>
            : <ExceptionForm id={e.id} needsVerdict={e.type === "NOSHOW_OBJECTION"} inProgress={e.status === "IN_PROGRESS"} />}
        </td>
      </tr>
    );
  };

  return (
    <main className="flex flex-col gap-8">
      <AdminHeader crumb="예외" title="예외 처리함">자동으로 끝내지 못한 건만 모았어요. 노쇼 이의 제기는 참석 인정과 노쇼 유지 중 하나로 판단해 주세요.</AdminHeader>
      <section className={cardCls}>
        <h2 className="border-b border-line bg-paper px-4 py-2.5 text-[13px] font-bold">처리할 건 <span className="tabular text-muted">{open?.length ?? 0}</span></h2>
        <table className="w-full text-[13px]"><tbody>{(open as Exc[] | null)?.map((e) => <Row key={e.id} e={e} />)}</tbody></table>
        {!open?.length && <Empty>처리할 예외가 없어요. 자동화가 모두 끝냈어요.</Empty>}
      </section>
      {!!done?.length && (
        <section className={cardCls}>
          <h2 className="border-b border-line bg-paper px-4 py-2.5 text-[13px] font-bold">최근 해결한 건</h2>
          <table className="w-full text-[13px]"><tbody>{(done as Exc[]).map((e) => <Row key={e.id} e={e} />)}</tbody></table>
        </section>
      )}
    </main>
  );
}
