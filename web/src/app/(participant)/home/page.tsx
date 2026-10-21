// S-05 홈: 다음 모집 회차, 내 신청 상태, 진행 순서.
import Image from "next/image";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Bell, CalendarCheck, ChevronRight, CircleHelp, Clock, History, MapPin, MessageCircle, UserRound, UtensilsCrossed, WalletCards } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Endorsement, Eyebrow, Wordmark } from "@/components/brand";
import { TableSeats } from "@/components/table-seats";
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
  { icon: UtensilsCrossed, title: "함께하는 저녁", body: "처음 보는 사람들과 좋은 저녁 한 끼." },
];

export default async function HomePage() {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const nowIso = new Date().toISOString();

  const [{ data: nextRound }, { data: myApp }, { count: unread }] = await Promise.all([
    supabase.from("rounds").select("id, event_date, start_at, apply_deadline_at, round_regions(region_code)")
      .eq("status", "OPEN").gt("apply_deadline_at", nowIso).order("event_date").limit(1).maybeSingle(),
    supabase.from("applications").select("id, table_id, application_status, match_status, payment_status, attendance_status, payment_due_at, application_choices(region_code, rounds(start_at, match_run_at))")
      .eq("profile_id", profile.id).eq("is_active", true).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", profile.id).is("read_at", null),
  ]);

  // After the event the application is closed; show the last table for feedback / no-show check.
  let lastTable: { id: string; when: string; needsFeedback: boolean; noshowPending: boolean } | null = null;
  if (!myApp) {
    const { data: last } = await supabase.from("applications")
      .select("id, application_choices(rounds(start_at, status))")
      .eq("profile_id", profile.id).eq("match_status", "CONFIRMED").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const round = ((last?.application_choices ?? []) as unknown as { rounds: { start_at: string; status: string } | null }[]).map((c) => c.rounds).find((r) => r?.status === "DONE");
    if (last && round) {
      const [{ data: fb }, { data: ns }] = await Promise.all([
        supabase.from("feedbacks").select("id").eq("application_id", last.id).maybeSingle(),
        supabase.from("noshow_cases").select("result").eq("application_id", last.id).maybeSingle(),
      ]);
      lastTable = { id: last.id, when: fmt(round.start_at, { month: "long", day: "numeric", weekday: "short" }), needsFeedback: !fb, noshowPending: ns?.result === "PENDING" };
    }
  }

  const db = createAdminClient();
  const [{ data: reviewRows }, { data: myTable }] = await Promise.all([
    db.from("feedbacks").select("review_rating, review_text, dining_tables(region_code, rounds(event_date))")
      .eq("review_public", true).eq("review_hidden", false).not("review_text", "is", null).order("submitted_at", { ascending: false }).limit(3),
    myApp?.table_id && myApp.match_status === "CONFIRMED"
      ? db.from("dining_tables").select("venues(name)").eq("id", myApp.table_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  type ReviewTable = { region_code: string; rounds: { event_date: string } | { event_date: string }[] | null };
  const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const reviews = (reviewRows ?? []).map((r) => {
    const t = one(r.dining_tables as unknown as ReviewTable | ReviewTable[] | null);
    const d = one(t?.rounds)?.event_date;
    return { ...r, where: [t ? REGION_LABEL[t.region_code] : "", d ? fmt(`${d}T12:00:00+09:00`, { month: "long", day: "numeric" }) : ""].filter(Boolean).join(" · ") };
  });
  const venueName = (one((myTable as { venues: unknown } | null)?.venues as { name: string } | { name: string }[] | null))?.name ?? null;

  const regions = ((nextRound?.round_regions ?? []) as { region_code: string }[]).map((r) => r.region_code).filter((c) => c !== "ETC");
  // D-day by calendar days in KST (a deadline on Monday seen on the Tuesday before is D-6, not D-7).
  const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const daysLeft = nextRound ? Math.max(0, Math.round((Date.parse(kstDay(nextRound.apply_deadline_at)) - Date.parse(kstDay(nowIso))) / 86400000)) : 0;

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper bg-[radial-gradient(120%_40%_at_50%_0%,rgba(184,149,95,0.18),transparent_70%)]">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/90 backdrop-blur lg:border-cream/10 lg:bg-espresso lg:backdrop-blur-none">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-5">
          <span className="lg:hidden"><Wordmark size="sm" /></span>
          <span className="hidden lg:inline-flex"><Wordmark tone="light" size="sm" /></span>
          <Link href="/notifications" aria-label={unread ? `알림 ${unread}개 읽지 않음` : "알림"} className="relative rounded-full p-2 text-ink/70 hover:bg-sand lg:text-cream/80 lg:hover:bg-cream/10">
            <Bell className="h-5 w-5" strokeWidth={1.75} />
            {!!unread && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-semibold leading-none text-white tabular">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-5 pb-16">
        <section className="pt-7">
          <p className="text-sm text-muted">{profile.display_name}님,</p>
          <h1 className="mt-1 text-[22px] font-bold leading-snug tracking-[-0.02em]">{myApp?.match_status === "CONFIRMED" ? "곧 만날 식탁이 기다리고 있어요" : "이번 주는 어떤 저녁을 보낼까요?"}</h1>
        </section>

        {myApp ? (
          <>
          {/* 내 신청 */}
          <section className="mt-8">
            <h2 className="text-[15px] font-bold">내 신청</h2>
            {myApp ? (
              <MyApplication app={myApp as unknown as MyApp} venue={venueName} />
            ) : lastTable ? (
              <div className="mt-3 rounded-2xl border border-line bg-white p-5">
                <p className="text-[12px] font-medium text-muted">지난 식탁</p>
                <p className="mt-1 text-[15px] font-semibold">{lastTable.when}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {lastTable.noshowPending && (
                    <Link href={`/applications/${lastTable.id}/noshow`} className="flex h-11 items-center justify-center rounded-xl bg-ember text-[14px] font-semibold text-cream">참석 여부 확인하기</Link>
                  )}
                  {lastTable.needsFeedback ? (
                    <Link href={`/applications/${lastTable.id}/feedback`} className="flex h-11 items-center justify-center rounded-xl bg-ink text-[14px] font-semibold text-cream">피드백 남기기</Link>
                  ) : (
                    <p className="text-center text-[12px] text-muted">피드백을 남겨 주셔서 고마워요. 다음 식탁에 반영돼요.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col items-center rounded-2xl border border-dashed border-line px-5 py-6 text-center">
                <TableSeats seats={5} size={84} label="빈 식탁" />
                <p className="mt-2 text-[14px] text-ink/80">아직 신청한 식탁이 없어요.</p>
                <p className="mt-1 text-[12px] text-muted">마음에 드는 날짜를 골라 첫 저녁을 시작해 보세요.</p>
              </div>
            )}
          </section>

          {/* 다음 모집 회차 */}
          <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(42,33,27,0.04),0_8px_24px_rgba(42,33,27,0.06)]">
            <div className="relative h-36">
              <Image src="/images/candle-table.webp" alt="" fill sizes="448px" className="object-cover object-[70%_center]" />
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
                  <p className="text-center text-[12px] text-muted">지금 신청이 끝나면 이 회차부터 다시 신청할 수 있어요.</p>
                ) : (
                  <Link href="/rounds" className="flex h-12 w-full items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-cream transition hover:bg-espresso">
                    신청하기
                  </Link>
                )}
              </div>
            )}
          </section>

          </>
        ) : (
          <>
          {/* 다음 모집 회차 */}
          <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(42,33,27,0.04),0_8px_24px_rgba(42,33,27,0.06)]">
            <div className="relative h-36">
              <Image src="/images/candle-table.webp" alt="" fill sizes="448px" className="object-cover object-[70%_center]" />
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
                  <p className="text-center text-[12px] text-muted">지금 신청이 끝나면 이 회차부터 다시 신청할 수 있어요.</p>
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
              <MyApplication app={myApp as unknown as MyApp} venue={venueName} />
            ) : lastTable ? (
              <div className="mt-3 rounded-2xl border border-line bg-white p-5">
                <p className="text-[12px] font-medium text-muted">지난 식탁</p>
                <p className="mt-1 text-[15px] font-semibold">{lastTable.when}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {lastTable.noshowPending && (
                    <Link href={`/applications/${lastTable.id}/noshow`} className="flex h-11 items-center justify-center rounded-xl bg-ember text-[14px] font-semibold text-cream">참석 여부 확인하기</Link>
                  )}
                  {lastTable.needsFeedback ? (
                    <Link href={`/applications/${lastTable.id}/feedback`} className="flex h-11 items-center justify-center rounded-xl bg-ink text-[14px] font-semibold text-cream">피드백 남기기</Link>
                  ) : (
                    <p className="text-center text-[12px] text-muted">피드백을 남겨 주셔서 고마워요. 다음 식탁에 반영돼요.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col items-center rounded-2xl border border-dashed border-line px-5 py-6 text-center">
                <TableSeats seats={5} size={84} label="빈 식탁" />
                <p className="mt-2 text-[14px] text-ink/80">아직 신청한 식탁이 없어요.</p>
                <p className="mt-1 text-[12px] text-muted">마음에 드는 날짜를 골라 첫 저녁을 시작해 보세요.</p>
              </div>
            )}
          </section>

          </>
        )}

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
        <Link href="/history" className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4 text-[14px] font-medium">
          <span className="flex items-center gap-2"><History className="h-4 w-4 text-muted" strokeWidth={1.75} />참가 이력 · 다음 일정 추천</span>
          <ChevronRight className="h-4 w-4 text-muted" />
        </Link>
        <Link href="/support" className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4 text-[14px] font-medium">
          <span className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-muted" strokeWidth={1.75} />FAQ · 문의</span>
          <ChevronRight className="h-4 w-4 text-muted" />
        </Link>

        {/* F-86: three latest public reviews, writers never named */}
        {reviews.length > 0 && (
          <section className="mt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">지난 모임 후기</h2>
              <Link href="/reviews" className="text-[12px] text-muted underline underline-offset-2">더 보기</Link>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {reviews.map((r, i) => (
                <li key={i} className="rounded-2xl border border-line bg-white px-4 py-3">
                  <p className="flex items-center gap-2 text-[12px]"><span className="text-ember">{"★".repeat(r.review_rating ?? 0)}</span><span className="text-muted">{r.where}</span></p>
                  <p className="mt-0.5 text-[14px] leading-relaxed">{r.review_text}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 flex items-center justify-between border-t border-line pt-5">
          <Endorsement />
          <form action={logout}><button className="text-[12px] text-muted underline underline-offset-4">로그아웃</button></form>
        </footer>
      </div>
    </main>
  );
}

type MyApp = {
  id: string; table_id: string | null; application_status: string; match_status: string; payment_status: string; attendance_status: string; payment_due_at: string | null;
  application_choices: { region_code: string; rounds: { start_at: string; match_run_at: string } | null }[];
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "결제 대기", PAID: "결제 완료", FAILED: "결제 실패", REFUND_AVAILABLE: "환불 가능", REFUND_REQUESTED: "환불 요청",
  REFUND_PROCESSING: "환불 처리 중", REFUNDED: "환불 완료", REFUND_FAILED: "환불 실패",
};
const ATTEND_LABEL: Record<string, string> = { SCHEDULED: "참석 예정", ATTENDED: "참석", CANCELED_EARLY: "사전 취소", CANCELED_LATE: "늦은 취소", NO_SHOW: "노쇼" };

// F-17: 신청·결제·매칭·참석 상태를 한 카드에.
function MyApplication({ app, venue }: { app: MyApp; venue: string | null }) {
  const rounds = [...new Map(app.application_choices.filter((c) => c.rounds).map((c) => [c.rounds!.start_at, c.rounds!])).values()].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const regions = [...new Set(app.application_choices.map((c) => c.region_code))];
  const rows: [string, string, boolean][] = [
    ["신청", app.application_status === "SUBMITTED" ? "제출 완료" : app.application_status === "CANCELED" ? "취소" : "작성 중", true],
    ["결제", PAYMENT_LABEL[app.payment_status] ?? app.payment_status, app.payment_status === "PAID"],
    ["매칭", MATCH_LABEL[app.match_status] ?? app.match_status, app.match_status === "CONFIRMED"],
    // Attendance only means something once a table is confirmed.
    ["참석", app.match_status === "CONFIRMED" || app.attendance_status !== "SCHEDULED"
      ? ATTEND_LABEL[app.attendance_status] ?? app.attendance_status
      : ["ALTERNATIVE_OFFERED", "EXCEPTION", "NO_MATCH"].includes(app.match_status) ? "해당 없음" : "확정 후", app.attendance_status === "ATTENDED"],
  ];
  const confirmed = app.match_status === "CONFIRMED" && rounds[0];
  const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const dday = confirmed ? Math.round((Date.parse(kstDay(rounds[0].start_at)) - Date.parse(kstDay(new Date().toISOString()))) / 86400000) : null;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
      {confirmed ? (
        // A reservation ticket: dark stub with the table, a perforated edge, then the details.
        <div className="relative bg-espresso px-5 py-4 text-cream">
          <div className="flex items-center gap-4">
            {/* Calendar stub: month, a large serif day and the weekday, like the stub of a reservation ticket. */}
            <div className="flex w-14 shrink-0 flex-col items-center rounded-xl border border-gold/35 bg-cream/[0.04] py-1.5 text-center">
              <span className="text-[10px] font-medium tracking-[0.08em] text-gold">{fmt(rounds[0].start_at, { month: "long" })}</span>
              <span className="font-serif text-[26px] font-bold leading-none text-cream tabular">{fmt(rounds[0].start_at, { day: "numeric" }).replace("일", "")}</span>
              <span className="text-[10px] text-cream/60">{fmt(rounds[0].start_at, { weekday: "short" })}요일</span>
            </div>
            <div className="min-w-0 flex-1">
              <Eyebrow tone="light">이번 식탁</Eyebrow>
              <p className="mt-1 truncate text-[17px] font-bold">{venue ?? "식당 안내 예정"}</p>
              <p className="mt-0.5 truncate text-[13px] text-cream/70">저녁 {fmt(rounds[0].start_at, { hour: "2-digit", minute: "2-digit", hour12: false })} · {regions.map((r) => REGION_LABEL[r] ?? r).join(" · ")}</p>
            </div>
            {dday !== null && dday >= 0 && <span className="shrink-0 font-serif text-[26px] font-bold text-gold tabular">{dday === 0 ? "오늘" : `D-${dday}`}</span>}
          </div>
          <div aria-hidden className="absolute inset-x-4 -bottom-px border-b border-dashed border-cream/25" />
          <span aria-hidden className="absolute -bottom-2.5 -left-2.5 h-5 w-5 rounded-full bg-paper" />
          <span aria-hidden className="absolute -bottom-2.5 -right-2.5 h-5 w-5 rounded-full bg-paper" />
        </div>
      ) : (
        <div className="px-5 pt-5">
          <p className="text-[15px] font-semibold">{rounds.map((r) => fmt(r.start_at, { month: "numeric", day: "numeric", weekday: "short" })).join(" · ")}</p>
          <p className="mt-0.5 text-[13px] text-muted">{regions.map((r) => REGION_LABEL[r] ?? r).join(" · ")}</p>
        </div>
      )}
      <div className="px-5 pb-5">
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
      {app.attendance_status === "SCHEDULED" && !["ALTERNATIVE_OFFERED", "EXCEPTION"].includes(app.match_status) && (
        <Link href={`/applications/${app.id}/cancel`} className="mt-3 block text-center text-[12px] text-muted underline underline-offset-2">
          신청 취소 · 불참 알리기
        </Link>
      )}
      </div>
    </div>
  );
}
