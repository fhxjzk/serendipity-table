// S-04 이용권·결제 (F-10~F-14). After payment the same page shows the completion state.
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { PageHeader, primaryButton } from "@/components/participant-ui";
import { REGION_LABEL } from "@/lib/format";
import { PaymentForm, type PayOption } from "./payment-form";

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...o }).format(new Date(iso));
const short = { month: "numeric", day: "numeric", weekday: "short" } as const;
const withTime = { ...short, hour: "2-digit", minute: "2-digit", hour12: false } as const;

const BENEFITS = "회당 할인 · 신청할 때 자동 차감 · 매칭 실패 시 횟수 복원 · 모집 알림 먼저 받기";

export default async function PaymentPage({ searchParams }: PageProps<"/apply/payment">) {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const { app } = await searchParams;
  if (typeof app !== "string") notFound();

  const { data: application } = await supabase
    .from("applications")
    .select("id, is_active, payment_status, payment_due_at, ticket_product_code, application_choices(region_code, rounds(event_date, start_at, match_run_at))")
    .eq("id", app).eq("profile_id", profile.id).maybeSingle();
  if (!application) notFound();

  type Choice = { region_code: string; rounds: { event_date: string; start_at: string; match_run_at: string } | null };
  const choices = (application.application_choices ?? []) as unknown as Choice[];
  const dates = [...new Map(choices.filter((c) => c.rounds).map((c) => [c.rounds!.event_date, c.rounds!])).values()].sort((a, b) => a.event_date.localeCompare(b.event_date));
  const regions = [...new Set(choices.map((c) => c.region_code))];
  const lastDate = dates.at(-1)?.event_date ?? "";
  const firstMatch = dates[0]?.match_run_at;

  const summary = (
    <div className="rounded-2xl border border-line bg-white p-5 text-[14px]">
      <p className="text-[12px] font-medium text-muted">신청 내용</p>
      <p className="mt-1.5 font-semibold">{dates.map((d) => fmt(d.start_at, short)).join(" · ")}</p>
      <p className="mt-1 text-ink/80">{regions.map((r) => REGION_LABEL[r] ?? r).join(" · ")}</p>
    </div>
  );

  const expired = application.payment_status === "PENDING" && (!application.is_active || (application.payment_due_at && application.payment_due_at < new Date().toISOString()));
  if (expired) {
    return (
      <main className="flex min-h-dvh flex-1 flex-col bg-paper">
        <PageHeader title="결제 기한 지남" />
        <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-8 text-center">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">결제 기한이 지나 신청이 마감됐어요</h2>
          <p className="text-[13px] text-muted">결제되지 않은 신청은 매칭에 들어가지 않아요. 다시 신청해 주세요.</p>
          {summary}
          <Link href="/rounds" className={primaryButton}>다시 신청하기</Link>
        </div>
      </main>
    );
  }

  if (application.payment_status !== "PENDING") {
    return (
      <main className="flex min-h-dvh flex-1 flex-col bg-paper">
        <PageHeader title="신청 완료" />
        <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-8">
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" strokeWidth={1.5} />
            <h2 className="mt-3 text-[20px] font-bold tracking-[-0.02em]">신청과 결제가 끝났어요</h2>
            {firstMatch && <p className="mt-2 text-[13px] text-muted">{fmt(firstMatch, withTime)}에 자동 매칭 결과를 알려 드려요.</p>}
          </div>
          {summary}
          <RefundPolicy />
          <Link href="/home" className={primaryButton}>홈으로</Link>
        </div>
      </main>
    );
  }

  const [{ data: products }, { data: tickets }, { data: coupon }] = await Promise.all([
    supabase.from("ticket_products").select("code, name, kind, price, uses, valid_days").eq("active", true).order("price"),
    supabase.from("user_tickets").select("id, product_code, remaining_uses, valid_until").eq("profile_id", profile.id).eq("status", "ACTIVE").gt("remaining_uses", 0),
    supabase.from("coupons").select("discount_rate, valid_until").eq("profile_id", profile.id).eq("status", "ISSUED").order("discount_rate", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const usable = (tickets ?? []).filter((t) => !t.valid_until || t.valid_until >= lastDate);
  const options: PayOption[] = [
    ...usable.map((t) => ({
      value: `TICKET:${t.id}`, title: "보유 이용권 사용", badge: `${t.remaining_uses}회 남음`, price: 0,
      sub: t.valid_until ? `${t.valid_until}까지 사용 가능` : "기간 제한 없음",
    })),
    ...(products ?? []).map((p) => ({
      value: p.code, title: p.name, price: p.price,
      badge: p.uses > 1 ? `회당 ${Math.round(p.price / p.uses).toLocaleString()}원` : undefined,
      sub: p.kind === "SUBSCRIPTION" ? `${p.valid_days}일 안에 ${p.uses}회 · ${BENEFITS}` : "이번 한 번만 참가",
    })),
  ];

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="이용권·결제" back="/home" step="3 / 3" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-5">
        {summary}
        {application.payment_due_at && (
          <p className="flex items-start gap-2 rounded-xl bg-sand/70 px-4 py-3 text-[13px] text-ink/80">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            {fmt(application.payment_due_at, withTime)}까지 결제해야 매칭 대상이 돼요. 기한이 지나면 결제 대기로 남고 매칭에서 빠져요.
          </p>
        )}
        <PaymentForm appId={application.id} options={options} discountRate={coupon?.discount_rate ?? 0} />
        <RefundPolicy />
      </div>
    </main>
  );
}

function RefundPolicy() {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 text-[13px] leading-relaxed text-ink/80">
      <p className="font-semibold text-ink">환불 규정</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>행사 3일 전까지 취소하면 전액 환불(구독은 횟수 복원)돼요.</li>
        <li>행사 2일 전부터는 환불되지 않아요.</li>
        <li>당일에는 취소 대신 불참 알림만 가능하고, 단체방은 나갈 수 없어요.</li>
        <li>매칭이 안 되면 다른 일정·이용권 보관·환불 중에서 고를 수 있어요.</li>
      </ul>
    </div>
  );
}
