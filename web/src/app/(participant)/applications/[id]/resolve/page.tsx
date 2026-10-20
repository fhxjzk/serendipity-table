// S-06 매칭 실패 해결: 사유, 대체 일정, 일정 이동·이용권 보관·환불 (F-18~F-21).
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Gift } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { PageHeader, primaryButton } from "@/components/participant-ui";
import { FAIL_REASON_TEXT, REALLOC_FAILED_TEXT } from "@/lib/matching/reasons";
import type { FailReason } from "@/lib/matching/types";
import { REGION_LABEL } from "@/lib/format";
import { ResolveForm, type OfferOption } from "./resolve-form";

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...o }).format(new Date(iso));

const DONE_TEXT: Record<string, { title: string; body: string }> = {
  MOVE: { title: "새 일정으로 옮겼어요", body: "결제는 그대로 이어져요. 새 일정의 자동 매칭 결과를 기다려 주세요." },
  KEEP: { title: "이용권으로 보관했어요", body: "다음 신청 때 결제 대신 보관한 이용권을 고를 수 있어요." },
  REFUND: { title: "환불을 마쳤어요", body: "시연용 모의 환불이라 실제 입금은 없어요." },
};

export default async function ResolvePage({ params }: PageProps<"/applications/[id]/resolve">) {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const { id } = await params;

  const { data: app } = await supabase
    .from("applications")
    .select("id, match_status, payment_status, reason_code, ticket_product_code, application_choices(rounds(start_at))")
    .eq("id", id).eq("profile_id", profile.id).maybeSingle();
  if (!app) notFound();

  const [{ data: resolution }, { data: offers }, { data: payment }, { data: coupon }] = await Promise.all([
    supabase.from("match_resolutions").select("choice, new_application_id").eq("application_id", id).maybeSingle(),
    supabase.from("alternative_offers").select("round_id, region_code, rank, rounds(start_at, apply_deadline_at, status)").eq("application_id", id).order("rank"),
    supabase.from("payments").select("amount").eq("application_id", id).eq("status", "PAID").maybeSingle(),
    supabase.from("coupons").select("discount_rate, valid_until").eq("profile_id", profile.id).eq("status", "ISSUED").order("issued_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const firstDate = ((app.application_choices ?? []) as unknown as { rounds: { start_at: string } | null }[])
    .map((c) => c.rounds?.start_at).filter(Boolean).sort()[0];

  if (resolution) {
    const t = DONE_TEXT[resolution.choice];
    return (
      <main className="flex min-h-dvh flex-1 flex-col bg-paper">
        <PageHeader title="처리 완료" />
        <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-10 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" strokeWidth={1.5} />
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.02em]">{t.title}</h2>
            <p className="mt-2 text-[13px] text-muted">{t.body}</p>
          </div>
          <Link href="/home" className={primaryButton}>홈으로</Link>
        </div>
      </main>
    );
  }

  if (!["ALTERNATIVE_OFFERED", "EXCEPTION"].includes(app.match_status)) {
    return (
      <main className="flex min-h-dvh flex-1 flex-col bg-paper">
        <PageHeader title="매칭 결과" />
        <div className="mx-auto w-full max-w-md px-5 pt-10 text-center text-[14px] text-muted">이 신청은 처리할 매칭 실패가 없어요.</div>
      </main>
    );
  }

  const nowIso = new Date().toISOString();
  type OfferRow = { round_id: string; region_code: string; rounds: { start_at: string; apply_deadline_at: string; status: string } | null };
  const options: OfferOption[] = ((offers ?? []) as unknown as OfferRow[])
    .filter((o) => o.rounds && o.rounds.status === "OPEN" && o.rounds.apply_deadline_at > nowIso)
    .map((o) => ({
      value: `${o.round_id}|${o.region_code}`,
      label: `${fmt(o.rounds!.start_at, { month: "long", day: "numeric", weekday: "short" })} · ${REGION_LABEL[o.region_code] ?? o.region_code}`,
      sub: `마감 ${fmt(o.rounds!.apply_deadline_at, { month: "numeric", day: "numeric" })}`,
    }));

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="매칭 결과 안내" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-5">
        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="text-[12px] font-medium text-ember">{firstDate ? fmt(firstDate, { month: "long", day: "numeric", weekday: "short" }) : ""} 매칭 결과</p>
          <h2 className="mt-1.5 text-[18px] font-bold leading-snug tracking-[-0.02em]">이번에는 함께할 식탁을 찾지 못했어요</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink/80">{app.reason_code === "REALLOC_FAILED" ? REALLOC_FAILED_TEXT : (FAIL_REASON_TEXT[app.reason_code as FailReason] ?? "조건에 맞는 테이블을 만들지 못했어요.")}</p>
          {coupon && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-sand/70 px-3 py-2.5 text-[13px]">
              <Gift className="h-4 w-4 text-ember" strokeWidth={1.75} />
              사과의 마음으로 다음 결제 {coupon.discount_rate}% 할인 쿠폰을 드렸어요{coupon.valid_until ? ` (${coupon.valid_until}까지)` : ""}.
            </p>
          )}
        </section>

        <div>
          <h3 className="text-[15px] font-bold">어떻게 할까요?</h3>
          <p className="mt-1 text-[12px] text-muted">한 번 고르면 바꿀 수 없어요.</p>
        </div>
        <ResolveForm appId={app.id} offers={options} isSubscription={(app.ticket_product_code ?? "SINGLE") !== "SINGLE"} amount={payment?.amount ?? 0} />
      </div>
    </main>
  );
}
