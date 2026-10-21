// Participant screens are designed for a phone. On a wide screen the app sits in a phone-sized column
// on the right, and the left becomes a quiet brand panel instead of empty space. Phones see no change.
import { CalendarCheck, MessageCircle, UtensilsCrossed, WalletCards } from "lucide-react";
import { Endorsement, Eyebrow, Wordmark } from "@/components/brand";
import { TableSeats } from "@/components/table-seats";

const STEPS = [
  { icon: WalletCards, text: "날짜·지역을 고르고 결제해요" },
  { icon: CalendarCheck, text: "행사 3일 전, 취향이 맞는 4~6명으로 묶여요" },
  { icon: MessageCircle, text: "식당·시간 안내와 단체방이 열려요" },
  { icon: UtensilsCrossed, text: "목요일 저녁, 처음 보는 사람들과 한 끼" },
];

export default function ParticipantLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row lg:bg-espresso">
      <aside className="relative hidden overflow-hidden text-cream lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-1 lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-20">
        <div aria-hidden className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <Wordmark tone="light" size="sm" />
          <Endorsement tone="light" />
        </div>
        <div className="relative max-w-md">
          <Eyebrow tone="light">Every Thursday · 7 PM</Eyebrow>
          <h2 className="mt-4 font-serif text-[40px] font-bold leading-[1.25] tracking-[-0.02em]">처음 보는 사람들과,<br />좋은 저녁 한 끼</h2>
          <div className="mt-8 flex items-center gap-6">
            <TableSeats seats={6} size={150} tone="dark" label="여섯 명이 둘러앉은 원형 식탁" />
            <ol className="flex flex-col gap-3">
              {STEPS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-[13px] text-cream/75">
                  <Icon className="h-4 w-4 shrink-0 text-gold" strokeWidth={1.75} />{text}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="relative text-[12px] text-cream/45">휴대폰에 맞춰 만든 화면이에요. 홈 화면에 추가하면 앱처럼 쓸 수 있어요.</p>
      </aside>
      <div className="flex min-h-dvh flex-1 flex-col bg-paper lg:w-[460px] lg:flex-none lg:shadow-[0_0_60px_rgba(0,0,0,0.35)] xl:mr-[8vw]">
        {children}
      </div>
    </div>
  );
}
