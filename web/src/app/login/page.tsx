import Image from "next/image";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Endorsement, Eyebrow, Wordmark } from "@/components/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { LoginForm } from "./login-form";
import { DemoLogins } from "./demo-logins";
import { demoAccounts } from "./actions";

async function loadStats() {
  const db = createAdminClient();
  const [{ count: people }, { data: regions }] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "PARTICIPANT"),
    db.from("code_values").select("code").eq("code_group", "REGION").neq("code", "ETC"),
  ]);
  return { people: people ?? 0, regions: regions?.length ?? 0 };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const stats = await loadStats();

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-espresso text-cream lg:flex-row">
      {/* 사진 + 소개 */}
      {/* 사진 원본이 1280×395라, PC에서는 늘리지 않고 원래 비율의 액자로 둔다. */}
      <section className="relative flex flex-col lg:min-h-dvh lg:w-[55%] lg:px-12 lg:py-10">
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 lg:static lg:p-0">
          <Wordmark tone="light" size="sm" />
          <Endorsement tone="light" />
        </header>
        <div className="relative h-[42vh] min-h-[280px] lg:mt-auto lg:aspect-[1280/395] lg:h-auto lg:min-h-0 lg:max-w-[760px] lg:overflow-hidden lg:rounded-2xl lg:ring-1 lg:ring-cream/10">
          <Image src="/images/hero-toast.jpg" alt="촛불 아래 잔을 부딪히는 사람들" fill priority sizes="(min-width: 1024px) 760px, 100vw" className="object-cover object-[20%_center] lg:object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-espresso/30 via-espresso/40 to-espresso lg:from-transparent lg:via-transparent lg:to-espresso/50" />
        </div>
        <div className="relative -mt-24 px-6 pb-8 lg:mb-auto lg:mt-10 lg:max-w-xl lg:px-0 lg:pb-0">
          <Eyebrow tone="light">Every Thursday · 7 PM</Eyebrow>
          <h1 className="mt-3 font-serif text-[32px] font-bold leading-[1.25] tracking-[-0.02em] lg:text-[44px]">
            처음 보는 사람들과,
            <br />
            좋은 저녁 한 끼
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-cream/70">
            매주 목요일 저녁, 취향이 맞는 4~6명이 한 테이블에 앉아요. 자리 배정과 식당 예약, 단체방 안내는 우연한 식탁이 맡아요.
          </p>
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-cream/80">
            <div className="flex items-center gap-1.5"><Users className="h-4 w-4 text-gold" strokeWidth={1.75} /><dt className="sr-only">신청자</dt><dd className="tabular">{stats.people.toLocaleString()}명이 함께했어요</dd></div>
            <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gold" strokeWidth={1.75} /><dt className="sr-only">지역</dt><dd>서울 {stats.regions}개 지역</dd></div>
            <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-gold" strokeWidth={1.75} /><dt className="sr-only">일정</dt><dd>매주 목요일 19시</dd></div>
          </dl>
        </div>
      </section>

      {/* 로그인 */}
      <section className="flex flex-1 items-start justify-center rounded-t-3xl bg-paper px-6 pb-12 pt-8 text-ink lg:items-center lg:rounded-none lg:px-16">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-bold tracking-[-0.02em]">로그인</h2>
          <p className="mt-1.5 text-sm text-muted">신청 현황과 이번 주 식탁을 확인하세요.</p>
          <div className="mt-7">
            <LoginForm next={typeof next === "string" ? next : undefined} />
          </div>
          <DemoLogins kinds={await demoAccounts()} />
          <p className="mt-5 text-xs leading-relaxed text-muted">
            해커톤 시연용 서비스예요. 위 버튼이나 안내받은 테스트 계정으로 로그인할 수 있어요.
          </p>
        </div>
      </section>
    </main>
  );
}
