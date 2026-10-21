import Image from "next/image";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Endorsement, Wordmark } from "@/components/brand";
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
  const { next, reason } = await searchParams;
  const stats = await loadStats();

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-espresso text-cream lg:flex-row">
      {/* 사진 + 소개: the photo already carries the name and headline, so only the facts sit on top. */}
      <section className="relative lg:sticky lg:top-0 lg:h-dvh lg:w-[55%]">
        <h1 className="sr-only">우연한 식탁 — 처음 보는 사람들과, 좋은 저녁 한 끼</h1>
        <div className="relative aspect-[2000/1493] w-full lg:aspect-auto lg:h-full">
          <Image src="/images/login-hero.webp" alt="한 식탁에 둘러앉아 웃으며 식사하는 사람들" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover lg:object-[30%_center]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-espresso via-espresso/60 to-transparent" />
          <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 lg:px-10 lg:py-8">
            <Wordmark tone="light" size="sm" />
            <Endorsement tone="light" />
          </header>
          <dl className="absolute inset-x-0 bottom-0 flex flex-wrap gap-x-6 gap-y-2 px-6 pb-5 text-[13px] text-cream/85 lg:px-10 lg:pb-10">
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
          {reason === "no-profile" && (
            <p role="alert" className="mt-5 rounded-lg bg-ember/10 px-3 py-2 text-[13px] text-ember">이 계정은 아직 참가자 정보가 준비되지 않았어요. 테스트 계정으로 로그인해 주세요.</p>
          )}
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
