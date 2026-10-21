// Participant screens are designed for a phone. On a wide screen the app sits in a phone-sized column
// on the right, and the left becomes a quiet brand panel instead of empty space. Phones see no change.
import { CalendarCheck, MessageCircle, UtensilsCrossed, WalletCards } from "lucide-react";
import Image from "next/image";

const STEPS = [
  { icon: WalletCards, text: "날짜·지역을 고르고 결제해요" },
  { icon: CalendarCheck, text: "행사 3일 전, 취향이 맞는 4~6명으로 묶여요" },
  { icon: MessageCircle, text: "식당·시간 안내와 단체방이 열려요" },
  { icon: UtensilsCrossed, text: "목요일 저녁, 처음 보는 사람들과 한 끼" },
];

export default function ParticipantLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row lg:bg-espresso">
      {/* The brand picture fills the panel at full height; it already carries the name and headline. */}
      <aside className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:block lg:h-dvh lg:flex-1">
        <Image src="/images/brand-portrait.webp" alt="우연한 식탁 — 처음 보는 사람들과, 좋은 저녁 한 끼" fill priority sizes="60vw" className="object-contain object-center" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-espresso via-espresso/80 to-transparent px-10 pb-8 pt-16 text-cream">
          <ol className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {STEPS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5 text-[12px] text-cream/80">
                <Icon className="h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={1.75} />{text}
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-cream/45">휴대폰에 맞춰 만든 화면이에요. 홈 화면에 추가하면 앱처럼 쓸 수 있어요.</p>
        </div>
      </aside>
      <div className="flex min-h-dvh flex-1 flex-col bg-paper lg:w-[460px] lg:flex-none lg:shadow-[0_0_60px_rgba(0,0,0,0.35)] xl:mr-[8vw]">
        {children}
      </div>
    </div>
  );
}
