// S-27 신고 검토·제재 확정 (F-68): reports from table mates and sanctions the system proposed.
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls } from "../ui";
import { ReportForm, SanctionForm } from "./report-forms";

const REASON: Record<string, string> = { RUDE: "무례한 언행", HARASS: "불쾌한 접근", NOSHOW: "무단 불참", ETC: "기타" };
const ACTION: Record<string, string> = { NONE: "조치 없음", WARNING: "경고", RESTRICTED: "참가 제한", BANNED: "이용 정지" };
const LEVEL: Record<string, string> = { WARNING: "경고", RESTRICTION: "참가 제한", BAN: "이용 정지" };
const STATUS: Record<string, { label: string; tone: "red" | "amber" | "green" }> = {
  OPEN: { label: "대기", tone: "red" }, REVIEWING: { label: "검토 중", tone: "amber" }, RESOLVED: { label: "처리됨", tone: "green" },
};
type Report = { id: string; reporter_id: string; reported_id: string; reason_code: string; detail: string | null; status: string; action: string | null; created_at: string };
type Sanction = { id: string; profile_id: string; level: string; status: string; source: string; reason: string; until_date: string | null; created_at: string };

export default async function ReportsPage() {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const [{ data: open }, { data: done }, { data: proposed }, { data: decided }] = await Promise.all([
    db.from("reports").select("*").neq("status", "RESOLVED").order("created_at"),
    db.from("reports").select("*").eq("status", "RESOLVED").order("handled_at", { ascending: false }).limit(8),
    db.from("sanctions").select("*").eq("status", "PROPOSED").order("created_at"),
    db.from("sanctions").select("*").neq("status", "PROPOSED").order("created_at", { ascending: false }).limit(8),
  ]);
  const reports = [...(open ?? []), ...(done ?? [])] as Report[];
  const sanctions = [...(proposed ?? []), ...(decided ?? [])] as Sanction[];
  const ids = [...new Set([...reports.flatMap((r) => [r.reporter_id, r.reported_id]), ...sanctions.map((s) => s.profile_id)])];
  const { data: people } = ids.length ? await db.from("profiles").select("id, name, restriction").in("id", ids) : { data: [] };
  const person = (id: string) => ((people ?? []) as { id: string; name: string; restriction: string }[]).find((p) => p.id === id);

  return (
    <main className="flex flex-col gap-8">
      <AdminHeader crumb="신고·제재" title="신고 검토와 제재 확정">
        신고한 사람은 상대방에게 알려지지 않아요. 노쇼 2회 이상은 시스템이 참가 제한을 제안하고, 여기서 확정하거나 반려해요.
      </AdminHeader>

      <section className={cardCls}>
        <h2 className="border-b border-line bg-paper px-4 py-2.5 text-[13px] font-bold">제재 제안 <span className="tabular text-muted">{proposed?.length ?? 0}</span></h2>
        <table className="w-full text-[13px]">
          <tbody>
            {(proposed as Sanction[] | null)?.map((s) => (
              <tr key={s.id} className="border-t border-line/70 align-top">
                <td className="px-4 py-3"><p className="font-medium">{person(s.profile_id)?.name}</p><p className="mt-1 text-[12px] text-muted">{formatKst(s.created_at)}</p></td>
                <td className="px-4 py-3"><Badge tone="amber">{LEVEL[s.level]} 제안</Badge><p className="mt-1 text-[12px] text-muted">{s.reason}</p></td>
                <td className="px-4 py-3"><SanctionForm id={s.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!proposed?.length && <Empty>확정할 제재 제안이 없어요.</Empty>}
      </section>

      <section className={cardCls}>
        <h2 className="border-b border-line bg-paper px-4 py-2.5 text-[13px] font-bold">신고 <span className="tabular text-muted">{open?.length ?? 0}</span></h2>
        <table className="w-full text-[13px]">
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-t border-line/70 align-top">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2"><Badge tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label}</Badge><span className="font-medium">{person(r.reported_id)?.name}</span></div>
                  <p className="mt-1 text-[12px] text-muted">신고자 {person(r.reporter_id)?.name} · {formatKst(r.created_at)}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{REASON[r.reason_code] ?? r.reason_code}</p>
                  {r.detail && <p className="mt-1 max-w-md rounded-lg bg-sand/50 px-3 py-2 text-[12px] leading-relaxed text-ink/80">“{r.detail}”</p>}
                </td>
                <td className="px-4 py-3">
                  {r.status === "RESOLVED" ? <span className="text-[12px] text-muted">{ACTION[r.action ?? "NONE"]}</span> : <ReportForm id={r.id} reviewing={r.status === "REVIEWING"} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reports.length && <Empty>접수된 신고가 없어요.</Empty>}
      </section>

      {!!decided?.length && (
        <section className={cardCls}>
          <h2 className="border-b border-line bg-paper px-4 py-2.5 text-[13px] font-bold">최근 제재 기록</h2>
          <table className="w-full text-[13px] tabular">
            <tbody>
              {(decided as Sanction[]).map((s) => (
                <tr key={s.id} className="border-t border-line/70">
                  <td className="px-4 py-2.5 font-medium">{person(s.profile_id)?.name}</td>
                  <td className="px-4 py-2.5">{LEVEL[s.level]}</td>
                  <td className="px-4 py-2.5"><Badge tone={s.status === "CONFIRMED" ? "green" : "gray"}>{s.status === "CONFIRMED" ? "확정" : "반려"}</Badge></td>
                  <td className="px-4 py-2.5 text-muted">{s.reason}{s.until_date && ` · ${s.until_date}까지`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
