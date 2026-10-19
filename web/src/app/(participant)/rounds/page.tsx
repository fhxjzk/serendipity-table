// S-03 모집 일정·지역 선택
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { PageHeader, primaryButton } from "@/components/participant-ui";
import { REGION_LABEL } from "@/lib/format";
import { RoundsForm, type RoundOption } from "./rounds-form";

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...o }).format(new Date(iso));

export default async function RoundsPage() {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const complete = profile.privacy_agreed_at && profile.policy_agreed_at && profile.interests.length && profile.self_traits.length && profile.wanted_traits.length && profile.price_ranges.length;
  if (!complete) redirect("/profile?next=/rounds");

  const { data: active } = await supabase.from("applications").select("id, payment_status").eq("profile_id", profile.id).eq("is_active", true).maybeSingle();
  if (active) {
    return (
      <main className="flex min-h-dvh flex-1 flex-col bg-paper">
        <PageHeader title="신청하기" />
        <div className="mx-auto w-full max-w-md px-5 pt-10 text-center">
          <p className="text-[16px] font-semibold">이미 진행 중인 신청이 있어요</p>
          <p className="mt-2 text-[13px] text-muted">한 번에 하나의 신청만 진행할 수 있어요.</p>
          <Link href={active.payment_status === "PENDING" ? `/apply/payment?app=${active.id}` : "/home"} className={`${primaryButton} mt-6`}>
            {active.payment_status === "PENDING" ? "결제 이어서 하기" : "홈에서 상태 보기"}
          </Link>
        </div>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("rounds")
    .select("id, start_at, apply_deadline_at, round_regions(region_code, capacity)")
    .eq("status", "OPEN").gt("apply_deadline_at", new Date().toISOString()).order("event_date");

  const rounds: RoundOption[] = (rows ?? []).map((r) => ({
    id: r.id,
    dateLabel: fmt(r.start_at, { month: "long", day: "numeric", weekday: "short" }),
    timeLabel: fmt(r.start_at, { hour: "2-digit", minute: "2-digit", hour12: false }),
    deadlineLabel: fmt(r.apply_deadline_at, { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
    regions: ((r.round_regions ?? []) as { region_code: string; capacity: number }[]).filter((g) => g.capacity > 0 && g.region_code !== "ETC").map((g) => g.region_code),
  }));
  const regionCodes = [...new Set(rounds.flatMap((r) => r.regions))];
  const regions = ["HONGDAE", "GANGNAM", "EULJIRO", "JAMSIL"].filter((c) => regionCodes.includes(c)).map((code) => ({ code, label: REGION_LABEL[code] }));

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="날짜·지역 고르기" back="/home" step="2 / 3" />
      <div className="mx-auto w-full max-w-md px-5 pt-5">
        {rounds.length === 0 ? (
          <p className="pt-10 text-center text-[14px] text-muted">지금 모집 중인 회차가 없어요. 다음 회차가 열리면 알려 드릴게요.</p>
        ) : (
          <RoundsForm rounds={rounds} regions={regions} />
        )}
      </div>
    </main>
  );
}
