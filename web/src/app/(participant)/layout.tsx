// Participant screens are designed for a phone. On a wide screen the app floats as a phone-sized card on the
// right over a softened photo of the table, and the left carries the service's line and the next open round.
// Phones see no change.
import Image from "next/image";
import { Endorsement, Eyebrow, Wordmark } from "@/components/brand";
import { createAdminClient } from "@/lib/supabase/admin";

const fmt = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export default async function ParticipantLayout({ children }: LayoutProps<"/">) {
  const { data: next } = await createAdminClient().from("rounds").select("start_at, round_regions(region_code, capacity)")
    .eq("status", "OPEN").gt("apply_deadline_at", new Date().toISOString()).order("event_date").limit(1).maybeSingle();
  const regions = ((next?.round_regions ?? []) as { region_code: string; capacity: number }[]).filter((r) => r.capacity > 0 && r.region_code !== "ETC").length;

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col lg:flex-row lg:bg-espresso">
      {/* A table set for six, seen from above — the logo's round table — softened and darkened so words stay calm on it. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 hidden overflow-hidden lg:block">
        <Image src="/images/table-overhead.webp" alt="" fill priority sizes="100vw" className="scale-105 object-cover object-center blur-[3px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(24,18,14,0.96)_0%,rgba(24,18,14,0.82)_42%,rgba(24,18,14,0.6)_75%,rgba(24,18,14,0.75)_100%)]" />
      </div>
      <aside className="relative hidden text-cream lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-1 lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16">
        <div className="flex items-center justify-between">
          <Wordmark tone="light" size="sm" />
          <Endorsement tone="light" />
        </div>
        <div className="max-w-md">
          <Eyebrow tone="light">Every Thursday · 7 PM</Eyebrow>
          <h2 className="mt-4 font-serif text-[42px] font-bold leading-[1.25] tracking-[-0.02em]">처음 보는 사람들과,<br />좋은 저녁 한 끼</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-cream/75">혼자 와도 괜찮아요. 취향이 맞는 4~6명이 한 식탁에 둘러앉아, 식사와 이야기를 나눠요.</p>
          {next && (
            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-[13px] text-cream/90">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />다음 식탁 {fmt(next.start_at)} · {regions}개 지역에서 모집 중
            </p>
          )}
        </div>
        <p className="text-[11px] text-cream/40">휴대폰에 맞춰 만든 화면이에요. 홈 화면에 추가하면 앱처럼 쓸 수 있어요.</p>
      </aside>
      {/* On PC the app is a card floating on the photo; overflow-clip keeps the rounded corners without breaking sticky headers. */}
      <div className="relative flex min-h-dvh flex-1 flex-col bg-paper lg:my-6 lg:bg-espresso lg:min-h-[calc(100dvh-3rem)] lg:w-[460px] lg:flex-none lg:overflow-clip lg:rounded-[28px] lg:shadow-[0_30px_80px_rgba(0,0,0,0.6)] lg:ring-1 lg:ring-cream/10 lg:mr-[5vw] xl:mr-[9vw]">
        {children}
      </div>
    </div>
  );
}
