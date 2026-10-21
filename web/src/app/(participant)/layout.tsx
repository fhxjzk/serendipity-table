// Participant screens are designed for a phone. On a wide screen the app sits in a phone-sized column
// on the right, and the left becomes a quiet brand panel instead of empty space. Phones see no change.
import { CalendarCheck, MessageCircle, UtensilsCrossed, WalletCards } from "lucide-react";
import Image from "next/image";
import { Endorsement, Eyebrow, Wordmark } from "@/components/brand";

const STEPS = [
  { icon: WalletCards, text: "날짜·지역을 고르고 결제해요" },
  { icon: CalendarCheck, text: "행사 3일 전, 취향이 맞는 4~6명으로 묶여요" },
  { icon: MessageCircle, text: "식당·시간 안내와 단체방이 열려요" },
  { icon: UtensilsCrossed, text: "목요일 저녁, 처음 보는 사람들과 한 끼" },
];

export default function ParticipantLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row lg:bg-espresso">
      {/* A table set for six, seen from above — the same round table as the logo motif. Words use the app's fonts. */}
      <aside className="relative hidden overflow-hidden text-cream lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-1 lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16">
        <Image src="/images/table-overhead.webp" alt="" fill priority sizes="60vw" className="object-cover object-[center_60%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-espresso/95 via-espresso/60 to-espresso/20" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-espresso/90 to-transparent" />
        <div className="relative flex items-center justify-between">
          <Wordmark tone="light" size="sm" />
          <Endorsement tone="light" />
        </div>
        <div className="relative max-w-md">
          <Eyebrow tone="light">Every Thursday · 7 PM</Eyebrow>
          <h2 className="mt-4 font-serif text-[42px] font-bold leading-[1.25] tracking-[-0.02em]">처음 보는 사람들과,<br />좋은 저녁 한 끼</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-cream/75">혼자 와도 괜찮아요. 취향이 맞는 4~6명이 한 식탁에 둘러앉아, 식사와 이야기를 나눠요.</p>
        </div>
        <div className="relative">
          <ol className="flex flex-wrap gap-x-6 gap-y-2">
            {STEPS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5 text-[12px] text-cream/80">
                <Icon className="h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={1.75} />{text}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-cream/45">휴대폰에 맞춰 만든 화면이에요. 홈 화면에 추가하면 앱처럼 쓸 수 있어요.</p>
        </div>
      </aside>
      <div className="flex min-h-dvh flex-1 flex-col bg-paper lg:w-[460px] lg:flex-none lg:shadow-[0_0_60px_rgba(0,0,0,0.35)] xl:mr-[8vw]">
        {children}
      </div>
    </div>
  );
}
