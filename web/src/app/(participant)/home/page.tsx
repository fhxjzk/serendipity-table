// S-05 홈: 다음 모집 회차, 내 신청 상태, 진행 순서.
import Image from "next/image";
import Link from "next/link";
import { Bell, CalendarCheck, ChevronRight, Clock, MapPin, MessageCircle, UserRound, UtensilsCrossed, WalletCards } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Endorsement, Eyebrow, Wordmark } from "@/components/brand";
import { REGION_LABEL } from "@/lib/format";

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...opts }).format(new Date(iso));

const MATCH_LABEL: Record<string, string> = {
  WAITING: "매칭 대기", MATCHING: "매칭 중", REALLOCATING: "자리 조정 중", CONFIRMED: "식탁 확정",
  ALTERNATIVE_OFFERED: "매칭 실패", TRANSFERRED: "일정 이동", NO_MATCH: "매칭 안 됨", EXCEPTION: "확인 중",
};

const STEPS = [
  { icon: WalletCards, title: "신청·결제", body: "날짜와 지역을 고르고 이용권으로 결제해요." },
  { icon: CalendarCheck, title: "자동 매칭", body: "행사 3일 전 18시, 취향이 맞는 4~6명으로 묶어요." },
  { icon: MessageCircle, title: "확정 안내", body: "식당·시간을 알려 드리고 단체방이 열려요." },
  { icon: UtensilsCrossed, title: "목요일 저녁", body: "처음 보는 사람들과 좋은 저녁 한 끼." },
];

export default async function HomePage() {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const nowIso = new Date().toISOString();

  const [{ data: nextRound }, { data: myApp }] = await Promise.all([
    supabase.from("rounds").select("id, event_date, start_at, apply_deadline_at, round_regions(region_code)")
      .eq("status", "OPEN").gt("apply_deadline_at", nowIso).order("event_date").limit(1).maybeSingle(),
    supabase.from("applications").select("id, application_status, match_status, payment_status, attendance_status, payment_due_at, application_choices(region_code, rounds(start_at, match_run_at))")
      .eq("profile_id", profile.id).eq("is_active", true).maybeSingle(),
  ]);

  const regions = ((nextRound?.round_regions ?? []) as { region_code: string }[]).map((r) => r.region_code).filter((c) => c !== "ETC");
  const daysLeft = nextRound ? Math.max(0, Math.ceil((new Date(nextRound.apply_deadline_at).getTime() - new Date(nowIso).getTime()) / 86400000)) : 0;

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <Wordmark size="sm" />
          <button aria-label="알림" className="rounded-full p-2 text-ink/70 hover:bg-sand"><Bell className="h-5 w-5" strokeWidth={1.75} /></button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-5 pb-16">
        <section className="pt-7">
          <p className="text-sm text-muted">{profile.display_name}님,</p>
          <h1 className="mt-1 text-[22px] font-bold leading-snug tracking-[-0.02em]">이번 주는 어떤 저녁을 보낼까요?</h1>
        </section>

        {/* 다음 모집 회차 */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(42,33,27,0.04),0_8px_24px_rgba(42,33,27,0.06)]">
          <div className="relative h-36">
            <Image src="/images/hero-toast.jpg" alt="" fill sizes="448px" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-espresso/85 via-espresso/30 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 text-cream">
              <Eyebrow tone="light">다음 우연한 식탁</Eyebrow>
              {nextRound ? (
                <p className="mt-1.5 text-xl font-bold tracking-[-0.02em]">
                  {fmt(nextRound.start_at, { month: "long", day: "numeric", weekday: "long" })} · {fmt(nextRound.start_at, { hour: "2-digit", minute: "2-digit", hour12: false })}
                </p>
              ) : (
                <p className="mt-1.5 text-xl font-bold">다음 회차를 준비하고 있어요</p>
              )}
            </div>
          </div>
          {nextRound && (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-[12px] text-ink/80">
                    <MapPin className="h-3 w-3" strokeWidth={2} />{REGION_LABEL[r] ?? r}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1.5 text-muted"><Clock className="h-4 w-4" strokeWidth={1.75} />신청 마감 {fmt(nextRound.apply_deadline_at, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                <span className="rounded-md bg-ember/10 px-2 py-0.5 text-[12px] font-semibold text-ember tabular">D-{daysLeft}</span>
              </div>
              {myApp ? (
                <p className="rounded-xl bg-sand/70 py-3 text-center text-[13px] text-ink/80">진행 중인 신청이 있어 새로 신청할 수 없어요.</p>
              ) : (
                <Link href="/rounds" className="flex h-12 w-full items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-cream transition hover:bg-espresso">
                  신청하기
                </Link>
              )}
            </div>
          )}
        </section>

        {/* 내 신청 */}
        <section className="mt-8">
          <h2 className="text-[15px] font-bold">내 신청</h2>
          {myApp ? (
            <MyApplication app={myApp as unknown as MyApp} />
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-line px-5 py-6 text-center">
              <p className="text-[14px] text-ink/80">아직 신청한 식탁이 없어요.</p>
              <p className="mt-1 text-[12px] text-muted">마음에 드는 날짜를 골라 첫 저녁을 시작해 보세요.</p>
            </div>
          )}
        </section>

        {/* 진행 순서 */}
        <section className="mt-8">
          <h2 className="text-[15px] font-bold">이렇게 진행돼요</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-ink/80"><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
                <div>
                  <p className="text-[14px] font-semibold"><span className="mr-1.5 text-muted tabular">{i + 1}</span>{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Link href="/profile" className="mt-8 flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4 text-[14px] font-medium">
          <span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted" strokeWidth={1.75} />내 프로필·알림 설정</span>
          <ChevronRight className="h-4 w-4 text-muted" />
        </Link>

        <footer className="mt-12 flex items-center justify-between border-t border-line pt-5">
          <Endorsement />
          <form action={logout}><button className="text-[12px] text-muted underline underline-offset-4">로그아웃</button></form>
        </footer>
      </div>
    </main>
  );
}

type MyApp = {
  id: string; application_status: string; match_status: string; payment_status: string; attendance_status: string; payment_due_at: string | null;
  application_choices: { region_code: string; rounds: { start_at: string; match_run_at: string } | null }[];
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "결제 대기", PAID: "결제 완료", FAILED: "결제 실패", REFUND_AVAILABLE: "환불 가능", REFUND_REQUESTED: "환불 요청",
  REFUND_PROCESSING: "환불 처리 중", REFUNDED: "환불 완료", REFUND_FAILED: "환불 실패",
};
const ATTEND_LABEL: Record<string, string> = { SCHEDULED: "참석 예정", ATTENDED: "참석", CANCELED_EARLY: "사전 취소", CANCELED_LATE: "늦은 취소", NO_SHOW: "노쇼" };

// F-17: 신청·결제·매칭·참석 상태를 한 카드에.
function MyApplication({ app }: { app: MyApp }) {
  const rounds = [...new Map(app.application_choices.filter((c) => c.rounds).map((c) => [c.rounds!.start_at, c.rounds!])).values()].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const regions = [...new Set(app.application_choices.map((c) => c.region_code))];
  const rows: [string, string, boolean][] = [
    ["신청", app.application_status === "SUBMITTED" ? "제출 완료" : app.application_status === "CANCELED" ? "취소" : "작성 중", true],
    ["결제", PAYMENT_LABEL[app.payment_status] ?? app.payment_status, app.payment_status === "PAID"],
    ["매칭", MATCH_LABEL[app.match_status] ?? app.match_status, app.match_status === "CONFIRMED"],
    ["참석", ATTEND_LABEL[app.attendance_status] ?? app.attendance_status, app.attendance_status === "ATTENDED"],
  ];
  return (
    <div className="mt-3 rounded-2xl border border-line bg-white p-5">
      <p className="text-[15px] font-semibold">{rounds.map((r) => fmt(r.start_at, { month: "numeric", day: "numeric", weekday: "short" })).join(" · ")}</p>
      <p className="mt-0.5 text-[13px] text-muted">{regions.map((r) => REGION_LABEL[r] ?? r).join(" · ")}</p>
      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
        {rows.map(([k, v, done]) => (
          <div key={k} className={`rounded-xl px-1 py-2.5 ${done ? "bg-ink text-cream" : "bg-sand/70 text-ink/80"}`}>
            <dt className="text-[11px] opacity-70">{k}</dt>
            <dd className="mt-0.5 text-[12px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {app.match_status === "CONFIRMED" ? (
        <Link href={`/applications/${app.id}/table`} className="mt-4 flex h-11 items-center justify-center rounded-xl bg-ink text-[14px] font-semibold text-cream">
          식탁 정보와 단체방 보기
        </Link>
      ) : ["ALTERNATIVE_OFFERED", "EXCEPTION"].includes(app.match_status) ? (
        <Link href={`/applications/${app.id}/resolve`} className="mt-4 flex h-11 items-center justify-center rounded-xl bg-ember text-[14px] font-semibold text-cream">
          매칭 결과 확인하고 다음 방법 고르기
        </Link>
      ) : app.payment_status === "PENDING" ? (
        <Link href={`/apply/payment?app=${app.id}`} className="mt-4 flex h-11 items-center justify-center rounded-xl bg-ember text-[14px] font-semibold text-cream">
          {app.payment_due_at ? `${fmt(app.payment_due_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}까지 결제하기` : "결제하기"}
        </Link>
      ) : app.match_status === "WAITING" && rounds[0] ? (
        <p className="mt-4 text-[12px] text-muted">{fmt(rounds[0].match_run_at, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}에 자동 매칭 결과를 알려 드려요.</p>
      ) : null}
    </div>
  );
}
