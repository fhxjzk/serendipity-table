// S-07 매칭 확정 상세: 시간·식당·지도·예약명·가격, 함께할 사람, 식사 조건 요약, 단체방 입장 (F-36, F-38).
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ExternalLink, MapPin, MessageCircle, Ticket, Wallet } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { PageHeader, primaryButton } from "@/components/participant-ui";
import { REGION_LABEL } from "@/lib/format";
import { loadTableForMember } from "@/lib/table-view";
import { CheckInButton } from "./checkin-button";
import { Eyebrow } from "@/components/brand";
import { TableSeats } from "@/components/table-seats";

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...o }).format(new Date(iso));

export default async function TablePage({ params }: PageProps<"/applications/[id]/table">) {
  const { profile } = await requireProfile("PARTICIPANT");
  const { id } = await params;
  const t = await loadTableForMember(profile.id, { applicationId: id });
  if (!t) notFound();

  const start = new Date(t.round.start_at);
  const gather = new Date(start.getTime() - 10 * 60000).toISOString();
  const rows = [
    { icon: Clock, label: "일시", value: <>{fmt(t.round.start_at, { month: "long", day: "numeric", weekday: "long" })} {fmt(t.round.start_at, { hour: "2-digit", minute: "2-digit", hour12: false })}<span className="mt-0.5 block text-[12px] text-muted">{fmt(gather, { hour: "2-digit", minute: "2-digit", hour12: false })}까지 도착해 주세요</span></> },
    { icon: MapPin, label: "장소", value: t.venue ? `${t.venue.name} · ${t.venue.address}` : `${REGION_LABEL[t.regionCode] ?? t.regionCode} — 식당은 곧 안내해 드려요` },
    { icon: Ticket, label: "예약명", value: t.reservationName ?? "-" },
    { icon: Wallet, label: "식사 가격", value: t.venue?.priceLabel ? `1인 ${t.venue.priceLabel} (현장에서 각자 결제)` : "현장에서 각자 결제" },
  ];

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="확정된 식탁" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-5">
        {/* The table itself: who sits where, under a candle. */}
        <section className="relative overflow-hidden rounded-3xl bg-espresso px-5 pb-6 pt-6 text-center text-cream shadow-[0_12px_32px_rgba(24,18,14,0.25)]">
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative">
            <Eyebrow tone="light">매칭 확정 · {t.mates.length}명의 식탁</Eyebrow>
            <div className="mt-2 flex justify-center">
              <TableSeats seats={t.mates.map((m) => ({ name: m.name, isMe: m.isMe }))} tone="dark" size={188} label={`${t.mates.length}명의 좌석: ${t.mates.map((m) => m.name).join(", ")}`} />
            </div>
            <h2 className="mt-1 font-serif text-[26px] font-bold tracking-[-0.02em]">{t.venue?.name ?? "식탁이 확정됐어요"}</h2>
            <p className="mt-1 text-[13px] text-cream/70">{fmt(t.round.start_at, { month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false })}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <dl className="flex flex-col gap-3 text-[14px]">
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <dt className="w-14 shrink-0 text-muted">{label}</dt>
                <dd className="flex-1">{value}</dd>
              </div>
            ))}
          </dl>
          {t.venue?.map_url && (
            <a href={t.venue.map_url} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-[14px] font-medium">
              지도에서 보기 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </section>

        {t.eventEnded ? (
          <Link href={`/applications/${id}/feedback`} className={`${primaryButton} bg-ember hover:bg-ember`}>오늘 저녁 피드백 남기기</Link>
        ) : t.checkInOpen ? (
          <CheckInButton appId={id} done={t.myAttendance === "ATTENDED"} />
        ) : null}

        {t.roomId && (
          <Link href={`/chat/${t.roomId}`} className={primaryButton}>
            <MessageCircle className="h-4 w-4" />단체방 들어가기
          </Link>
        )}

        {t.curation && (
          <section className="rounded-2xl bg-sand/70 p-5 text-[14px] leading-relaxed">
            <p className="text-[12px] font-semibold text-ember">이번 식탁은</p>
            <p className="mt-1.5">{t.curation}</p>
          </section>
        )}

        <section>
          <h3 className="text-[15px] font-bold">함께할 사람 {t.mates.length}명</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {t.mates.map((m) => (
              <li key={m.profileId} className="rounded-2xl border border-line bg-white p-4">
                <p className="text-[15px] font-semibold">
                  {m.name}{m.isMe && <span className="ml-1.5 rounded bg-sand px-1.5 py-0.5 text-[11px] font-medium text-muted">나</span>}
                  <span className="ml-2 text-[13px] font-normal text-muted">{m.ageBand} · {m.mbti === "UNKNOWN" ? "MBTI 모름" : m.mbti}</span>
                </p>
                {m.oneLiner && <p className="mt-1 text-[13px] text-ink/80">“{m.oneLiner}”</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.interests.map((i) => <span key={i} className="rounded-full bg-sand px-2 py-0.5 text-[11px] text-ink/70">{i}</span>)}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            연락처·나이·점수 같은 정보는 공개되지 않아요.{t.absentCount > 0 && ` 불참을 알린 ${t.absentCount}명은 목록에서 빠졌어요.`}
          </p>
        </section>

        {t.foodSummary && (
          <FoodSummary text={t.foodSummary} />
        )}

        {!t.eventEnded && t.myAttendance === "SCHEDULED" && (
          <Link href={`/applications/${id}/cancel`} className="text-center text-[13px] text-muted underline underline-offset-2">
            참석이 어려워졌나요? 취소 · 불참 알리기
          </Link>
        )}
        {t.myAttendance === "CANCELED_LATE" && !t.eventEnded && (
          <p className="rounded-xl bg-sand/60 px-4 py-3 text-center text-[13px] text-ink/80">불참을 알려 주셨어요. 단체방에도 전달됐어요.</p>
        )}
      </div>
    </main>
  );
}

// The table's food summary (F-38) as a titled list: "알레르기: 갑각류 1명" per line.
function FoodSummary({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  const items = lines[0]?.startsWith("식사 조건 (") ? lines.slice(1) : [];
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <p className="text-[14px] font-semibold">식사 조건 <span className="ml-1 text-[12px] font-normal text-muted">이름 없이 공유돼요</span></p>
      {items.length ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
          {items.map((l) => {
            const [k, v] = l.split(": ");
            return <li key={l} className="flex gap-3"><span className="w-20 shrink-0 text-muted">{k}</span><span>{v}</span></li>;
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-ink/80">이 식탁에는 알레르기나 못 먹는 음식이 없어요.</p>
      )}
    </section>
  );
}
