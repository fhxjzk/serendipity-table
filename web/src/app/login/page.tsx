import Image from "next/image";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Endorsement, Eyebrow, Wordmark } from "@/components/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { LoginForm } from "./login-form";
import { DemoLogins } from "./demo-logins";
import { demoAccounts } from "./actions";

async function loadStats() {
  const db = createAdminClient();
  const [{ count: people }, { data: regions }, { data: next }] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "PARTICIPANT"),
    db.from("code_values").select("code").eq("code_group", "REGION").neq("code", "ETC"),
    db.from("rounds").select("start_at").eq("status", "OPEN").gt("apply_deadline_at", new Date().toISOString()).order("event_date").limit(1).maybeSingle(),
  ]);
  const nextAt = next ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(next.start_at)) : null;
  return { people: people ?? 0, regions: regions?.length ?? 0, nextAt };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reason } = await searchParams;
  const stats = await loadStats();

  return (
    // The whole screen is one evening scene: the photo sits behind everything, and the sign-in card is dark glass on it.
    <main className="relative flex min-h-dvh flex-1 flex-col bg-espresso text-cream">
      <div className="relative h-[54vh] min-h-[320px] lg:fixed lg:inset-0 lg:h-auto">
        <Image src="/images/seoul-dinner.webp" alt="남산타워가 보이는 저녁 식당에서 둥근 식탁에 둘러앉아 웃는 사람들" fill priority sizes="100vw" className="object-cover object-[32%_center]" />
        <div className="absolute inset-0 bg-gradient-to-b from-espresso/40 via-transparent to-espresso lg:hidden" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(to_right,rgba(24,18,14,0.15)_30%,rgba(24,18,14,0.9)_72%)] lg:block" />
        <div className="absolute inset-x-0 bottom-0 hidden h-2/5 bg-gradient-to-t from-espresso via-espresso/60 to-transparent lg:block" />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 lg:fixed lg:px-14 lg:py-9">
        <Wordmark tone="light" size="sm" />
        <Endorsement tone="light" />
      </header>

      <div className="relative z-10 flex flex-1 flex-col lg:min-h-dvh lg:flex-row lg:items-stretch">
        {/* 소개 */}
        <section className="-mt-36 px-6 lg:mt-0 lg:flex lg:flex-1 lg:flex-col lg:justify-end lg:px-14 lg:pb-12">
          <Eyebrow tone="light">Serendipity Table</Eyebrow>
          <h1 className="mt-3 font-serif text-[32px] font-bold leading-[1.25] tracking-[-0.02em] lg:text-[44px]">
            처음 보는 사람들과,<br />좋은 저녁 한 끼
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-cream/75">
            취향이 맞는 4~6명이 한 식탁에 둘러앉아요. 자리 배정과 식당 예약, 단체방 안내는 우연한 식탁이 맡아요.
          </p>
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-cream/85">
            <div className="flex items-center gap-1.5"><Users className="h-4 w-4 text-gold" strokeWidth={1.75} /><dt className="sr-only">신청자</dt><dd className="tabular">{stats.people.toLocaleString()}명이 함께했어요</dd></div>
            <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gold" strokeWidth={1.75} /><dt className="sr-only">지역</dt><dd>서울 {stats.regions}개 지역</dd></div>
            <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-gold" strokeWidth={1.75} /><dt className="sr-only">다음 식탁</dt><dd>{stats.nextAt ? `다음 식탁 ${stats.nextAt}` : "다음 식탁 준비 중"}</dd></div>
          </dl>
        </section>

        {/* 로그인 */}
        <section className="px-5 pb-12 pt-8 lg:flex lg:w-[480px] lg:shrink-0 lg:items-center lg:px-8 lg:pb-8 lg:pt-20 xl:mr-[3vw]">
          <div className="w-full rounded-3xl border border-cream/10 bg-espresso/70 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7">
            <h2 className="text-xl font-bold tracking-[-0.02em]">로그인</h2>
            <p className="mt-1.5 text-sm text-cream/60">신청 현황과 이번 주 식탁을 확인하세요.</p>
            {reason === "no-profile" && (
              <p role="alert" className="mt-5 rounded-lg bg-ember/25 px-3 py-2 text-[13px] text-[#f3c4ab]">이 계정은 아직 참가자 정보가 준비되지 않았어요. 테스트 계정으로 로그인해 주세요.</p>
            )}
            <div className="mt-5">
              <LoginForm next={typeof next === "string" ? next : undefined} />
            </div>
            <DemoLogins kinds={await demoAccounts()} />
            <p className="mt-4 text-[11px] leading-relaxed text-cream/45">
              해커톤 시연용 서비스예요. 위 버튼이나 안내받은 테스트 계정으로 로그인할 수 있어요.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
