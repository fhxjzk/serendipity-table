// S-21 운영 대시보드 — 지금은 핵심 숫자 4개만. 지표 13종은 A5에서 채운다.
import Link from "next/link";
import { ArrowRight, CalendarDays, Percent, TriangleAlert, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst, todayKst } from "@/lib/format";

export default async function AdminPage() {
  const { profile } = await requireProfile("OPERATOR");
  const db = createAdminClient();
  const [{ count: participants }, { data: openRounds }, { data: lastRun }, { count: openExceptions }] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "PARTICIPANT"),
    db.from("rounds").select("id, title, match_run_at").eq("status", "OPEN").gte("event_date", todayKst()).order("event_date"),
    db.from("match_runs").select("stats, finished_at, rounds(title)").eq("status", "DONE").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("exceptions").select("id", { count: "exact", head: true }).neq("status", "RESOLVED"),
  ]);
  const run = lastRun as { stats: { success_rate?: number; seated?: number; candidates?: number } | null; finished_at: string; rounds: { title: string } | { title: string }[] | null } | null;
  const runTitle = Array.isArray(run?.rounds) ? run?.rounds[0]?.title : run?.rounds?.title;

  const cards = [
    { icon: Users, label: "참가자", value: `${(participants ?? 0).toLocaleString()}명`, note: "가상데이터 294명 포함" },
    { icon: CalendarDays, label: "모집 중 회차", value: `${openRounds?.length ?? 0}개`, note: openRounds?.[0] ? `다음 자동 매칭 ${formatKst(openRounds[0].match_run_at)}` : "예정된 회차 없음" },
    { icon: Percent, label: "최근 매칭 성공률", value: run ? `${run.stats?.success_rate ?? 0}%` : "-", note: run ? `${runTitle} · ${run.stats?.seated ?? 0}/${run.stats?.candidates ?? 0}명` : "아직 실행 기록 없음" },
    { icon: TriangleAlert, label: "처리할 예외", value: `${openExceptions ?? 0}건`, note: "매칭 실패·식당 부족 등" },
  ];

  return (
    <main className="flex flex-col gap-8">
      <div>
        <p className="text-[12px] font-medium text-muted">운영 · 대시보드</p>
        <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em]">{profile.display_name}님, 오늘의 운영 현황이에요</h1>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ icon: Icon, label, value, note }) => (
          <div key={label} className="rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(42,33,27,0.04)]">
            <div className="flex items-center gap-2 text-[12px] font-medium text-muted"><Icon className="h-4 w-4" strokeWidth={1.75} />{label}</div>
            <p className="mt-3 text-[28px] font-bold tracking-[-0.02em] tabular">{value}</p>
            <p className="mt-1 text-[12px] text-muted">{note}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["/admin/matching", "매칭 모니터에서 회차별 결과 보기"],
          ["/admin/exceptions", `예외 처리함에서 처리할 ${openExceptions ?? 0}건 확인`],
          ["/admin/rounds", "새 회차 만들기"],
          ["/admin/reports", "신고 검토와 제재 확정"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="group flex items-center justify-between rounded-xl border border-line bg-white px-5 py-4 text-[14px] font-semibold shadow-[0_1px_2px_rgba(42,33,27,0.04)] hover:border-ink/20">
            {label}
            <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </main>
  );
}
