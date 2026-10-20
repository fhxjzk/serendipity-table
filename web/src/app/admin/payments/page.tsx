// S-24 결제·환불·이용권 내역 (F-61): payments, automatic refunds and failures, ticket uses and restores, coupons.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls, thCls } from "../ui";

const TABS = [["payments", "결제"], ["refunds", "환불"], ["tickets", "이용권 차감·복원"], ["coupons", "보상 쿠폰"]] as const;
const PRODUCT: Record<string, string> = { SINGLE: "1회권", PACK3: "3회권", PACK4: "4회권" };
const REFUND_REASON: Record<string, string> = { EARLY_CANCEL: "사전 취소", MATCH_FAILED: "매칭 실패", REALLOC_FAILED: "재배치 실패", TABLE_CANCELED: "테이블 취소" };
const LEDGER_REASON: Record<string, string> = { PURCHASE: "구매", USE: "신청 차감", RESTORE: "복원", KEEP: "보관", EXPIRE: "만료" };
const COUPON_REASON: Record<string, string> = { REALLOC_FAILED: "매칭·재배치 실패", RUN_WITH_THREE: "당일 3명 진행", TABLE_CANCELED: "테이블 취소" };
const won = (n: number) => `${n.toLocaleString()}원`;
type Named = { name: string } | { name: string }[] | null;
const nameOf = (p: Named) => (Array.isArray(p) ? p[0]?.name : p?.name) ?? "-";
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" && TABS.some(([k]) => k === sp.tab) ? sp.tab : "payments") as (typeof TABS)[number][0];

  const [{ count: paidCount }, { count: refundCount }, { count: failedRefunds }, { count: couponCount }] = await Promise.all([
    db.from("payments").select("id", { count: "exact", head: true }).eq("status", "PAID"),
    db.from("refunds").select("id", { count: "exact", head: true }).eq("status", "REFUNDED"),
    db.from("refunds").select("id", { count: "exact", head: true }).eq("status", "FAILED"),
    db.from("coupons").select("id", { count: "exact", head: true }),
  ]);

  let body: React.ReactNode = null;
  if (tab === "payments") {
    const { data } = await db.from("payments").select("id, product_code, amount, discount_amount, coupon_id, status, paid_at, created_at, profiles(name)").order("created_at", { ascending: false }).limit(100);
    body = (
      <Table head={["참가자", "이용권", "결제 금액", "쿠폰 할인", "상태", "결제 시각"]} empty={!data?.length}>
        {(data ?? []).map((p) => (
          <tr key={p.id} className="border-t border-line/70">
            <td className="px-4 py-2.5 font-medium">{nameOf(p.profiles as Named)}</td>
            <td className="px-4 py-2.5">{PRODUCT[p.product_code] ?? p.product_code}</td>
            <td className="px-4 py-2.5">{won(p.amount)}</td>
            <td className="px-4 py-2.5">{p.discount_amount ? won(p.discount_amount) : "-"}</td>
            <td className="px-4 py-2.5"><Badge tone={p.status === "PAID" ? "green" : p.status === "FAILED" ? "red" : "amber"}>{p.status === "PAID" ? "결제 완료" : p.status === "FAILED" ? "실패" : "대기"}</Badge></td>
            <td className="px-4 py-2.5 text-muted">{formatKst(p.paid_at ?? p.created_at)}</td>
          </tr>
        ))}
      </Table>
    );
  } else if (tab === "refunds") {
    const { data } = await db.from("refunds").select("id, amount, reason, policy_exception, status, failure_reason, requested_at, completed_at, payments(product_code, profiles(name))").order("requested_at", { ascending: false }).limit(100);
    body = (
      <Table head={["참가자", "금액", "사유", "규정 예외", "상태", "완료 시각"]} empty={!data?.length}>
        {(data ?? []).map((r) => {
          const pay = one(r.payments as { product_code: string; profiles: Named } | { product_code: string; profiles: Named }[] | null);
          return (
            <tr key={r.id} className="border-t border-line/70">
              <td className="px-4 py-2.5 font-medium">{nameOf(pay?.profiles ?? null)}</td>
              <td className="px-4 py-2.5">{won(r.amount)}</td>
              <td className="px-4 py-2.5">{REFUND_REASON[r.reason] ?? r.reason}</td>
              <td className="px-4 py-2.5">{r.policy_exception ? "전액 환불(예외)" : "-"}</td>
              <td className="px-4 py-2.5"><Badge tone={r.status === "REFUNDED" ? "green" : r.status === "FAILED" ? "red" : "amber"}>{r.status === "REFUNDED" ? "환불 완료" : r.status === "FAILED" ? `실패${r.failure_reason ? ` · ${r.failure_reason}` : ""}` : "처리 중"}</Badge></td>
              <td className="px-4 py-2.5 text-muted">{formatKst(r.completed_at ?? r.requested_at)}</td>
            </tr>
          );
        })}
      </Table>
    );
  } else if (tab === "tickets") {
    const { data } = await db.from("ticket_ledger").select("id, delta, reason, created_at, user_tickets(product_code, remaining_uses, total_uses, profiles(name))").neq("reason", "PURCHASE").order("created_at", { ascending: false }).limit(100);
    body = (
      <Table head={["참가자", "이용권", "변동", "사유", "현재 잔여", "시각"]} empty={!data?.length}>
        {(data ?? []).map((l) => {
          const t = one(l.user_tickets as { product_code: string; remaining_uses: number; total_uses: number; profiles: Named } | { product_code: string; remaining_uses: number; total_uses: number; profiles: Named }[] | null);
          return (
            <tr key={l.id} className="border-t border-line/70">
              <td className="px-4 py-2.5 font-medium">{nameOf(t?.profiles ?? null)}</td>
              <td className="px-4 py-2.5">{t ? (PRODUCT[t.product_code] ?? t.product_code) : "-"}</td>
              <td className={`px-4 py-2.5 font-semibold ${l.delta > 0 ? "text-emerald-700" : "text-ink/70"}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}회</td>
              <td className="px-4 py-2.5">{LEDGER_REASON[l.reason] ?? l.reason}</td>
              <td className="px-4 py-2.5">{t ? `${t.remaining_uses}/${t.total_uses}회` : "-"}</td>
              <td className="px-4 py-2.5 text-muted">{formatKst(l.created_at)}</td>
            </tr>
          );
        })}
      </Table>
    );
  } else {
    const { data } = await db.from("coupons").select("id, reason, discount_rate, valid_until, status, issued_at, profiles(name)").order("issued_at", { ascending: false }).limit(100);
    body = (
      <Table head={["참가자", "발급 사유", "할인율", "유효기간", "상태", "발급 시각"]} empty={!data?.length}>
        {(data ?? []).map((c) => (
          <tr key={c.id} className="border-t border-line/70">
            <td className="px-4 py-2.5 font-medium">{nameOf(c.profiles as Named)}</td>
            <td className="px-4 py-2.5">{COUPON_REASON[c.reason] ?? c.reason}</td>
            <td className="px-4 py-2.5">{c.discount_rate}%</td>
            <td className="px-4 py-2.5">{c.valid_until ?? "-"}</td>
            <td className="px-4 py-2.5"><Badge tone={c.status === "ISSUED" ? "blue" : c.status === "USED" ? "green" : "gray"}>{c.status === "ISSUED" ? "미사용" : c.status === "USED" ? "사용함" : "만료"}</Badge></td>
            <td className="px-4 py-2.5 text-muted">{formatKst(c.issued_at)}</td>
          </tr>
        ))}
      </Table>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <AdminHeader crumb="결제" title="결제·환불·이용권 내역">결제, 자동 환불과 환불 실패, 이용권 차감·복원, 보상 쿠폰 발급·사용을 최근 100건씩 보여 줘요.</AdminHeader>
      <div className="grid gap-3 sm:grid-cols-4">
        {[["결제 완료", paidCount], ["환불 완료", refundCount], ["환불 실패", failedRefunds], ["쿠폰 발급", couponCount]].map(([label, n]) => (
          <div key={label as string} className={`${cardCls} p-4`}><p className="text-[12px] text-muted">{label}</p><p className="mt-1 text-[22px] font-bold tabular">{(n as number | null) ?? 0}건</p></div>
        ))}
      </div>
      <div className="flex gap-2">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/admin/payments?tab=${k}`} className={`rounded-full border px-3 py-1.5 text-[13px] ${k === tab ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/80 hover:bg-paper"}`}>{l}</Link>
        ))}
      </div>
      {body}
    </main>
  );
}

function Table({ head, empty, children }: { head: string[]; empty: boolean; children: React.ReactNode }) {
  return (
    <section className={cardCls}>
      <table className="w-full text-[13px] tabular">
        <thead className="border-b border-line bg-paper text-left text-[12px] text-muted"><tr>{head.map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <Empty>내역이 없어요.</Empty>}
    </section>
  );
}
