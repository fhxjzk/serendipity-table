// S-21 운영 대시보드 (F-65, F-69, F-72): today's numbers, what needs handling, 13 core metrics, satisfaction.
import Link from "next/link";
import { ArrowRight, CalendarDays, Percent, TriangleAlert, Users } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKst, todayKst } from "@/lib/format";
import { cardCls, thCls } from "./ui";

type Ratio = { num: number | null; den: number };
type Metrics = Record<string, Ratio>;

// Spec 4.7. `kind` decides how a ratio prints; the note says how the spec's open terms were read.
const METRICS: { key: string; label: string; formula: string; kind?: "secs"; note?: string }[] = [
  { key: "apply_complete", label: "신청 완료율", formula: "신청 제출 ÷ 신청 시작" },
  { key: "pay_conversion", label: "결제 전환율", formula: "결제 완료 ÷ 신청 제출" },
  { key: "match_success", label: "매칭 성공률", formula: "테이블에 확정된 참가자 ÷ 매칭 대상(결제 완료)" },
  { key: "auto_confirm", label: "자동 확정률", formula: "운영자 개입 없이 확정된 테이블 ÷ 확정 테이블", note: "스케줄러가 돌린 매칭의 테이블" },
  { key: "realloc_success", label: "자동 재배치 성공률", formula: "재배치 후 확정된 참가자 ÷ 재배치 대상", note: "확정 후 인원 감소 재배치 포함" },
  { key: "alt_conversion", label: "대체 일정 전환율", formula: "일정 이동 선택 ÷ 매칭 실패(ALTERNATIVE_OFFERED)" },
  { key: "refund_done", label: "자동 환불 완료율", formula: "REFUNDED ÷ 환불 요청" },
  { key: "attend_rate", label: "실제 참가 전환율", formula: "ATTENDED ÷ 확정 참가자", note: "행사가 끝난 테이블 기준" },
  { key: "noshow_rate", label: "노쇼율", formula: "NO_SHOW ÷ 확정 참가자", note: "행사가 끝난 테이블 기준" },
  { key: "revisit_rate", label: "재방문율", formula: "2회 이상 참석 ÷ 1회 이상 참석" },
  { key: "feedback_rate", label: "피드백 응답률", formula: "피드백 제출 ÷ ATTENDED" },
  { key: "operator_touch", label: "운영자 개입률", formula: "운영자 조치가 있었던 테이블 ÷ 확정 테이블", note: "예외 처리 기록이 있는 테이블" },
  { key: "exception_secs", label: "회차당 예외 처리 시간", formula: "예외 처리 완료 − 발생 시각의 회차별 평균", kind: "secs" },
  { key: "inquiry_auto", label: "문의 자동 해결률", formula: "자동 해결 문의 ÷ 전체 문의", note: "추가 기능(FAQ·문의)" },
];

const fmtRatio = (m: Ratio | undefined) => (m && m.den > 0 && m.num !== null ? `${Math.round((m.num / m.den) * 1000) / 10}%` : "-");
const fmtSecs = (m: Ratio | undefined) => {
  if (!m || m.den === 0 || m.num === null) return "-";
  return m.num < 90 ? `${m.num}초` : m.num < 5400 ? `${Math.round(m.num / 60)}분` : `${Math.round(m.num / 360) / 10}시간`;
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export default async function AdminPage() {
  const { profile } = await requireProfile("OPERATOR");
  const db = createAdminClient();
  const [
    { count: participants }, { data: openRounds }, { data: lastRun }, { data: openExc }, { data: metricsData },
    { count: activeApps }, { count: paidApps }, { count: waiting }, { count: noshowOpen }, { count: reportsOpen }, { count: sanctionsProposed }, { data: feedbacks },
  ] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "PARTICIPANT"),
    db.from("rounds").select("id, title, match_run_at, setting_overrides").eq("status", "OPEN").gte("event_date", todayKst()).order("event_date"),
    db.from("match_runs").select("stats, finished_at, rounds(title)").eq("status", "DONE").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("exceptions").select("type").neq("status", "RESOLVED"),
    db.rpc("dashboard_metrics"),
    db.from("applications").select("id", { count: "exact", head: true }).eq("is_active", true).eq("application_status", "SUBMITTED"),
    db.from("applications").select("id", { count: "exact", head: true }).eq("is_active", true).eq("payment_status", "PAID"),
    db.from("applications").select("id", { count: "exact", head: true }).eq("is_active", true).in("match_status", ["ALTERNATIVE_OFFERED", "EXCEPTION"]),
    db.from("noshow_cases").select("application_id", { count: "exact", head: true }).in("result", ["PENDING", "ESCALATED"]),
    db.from("reports").select("id", { count: "exact", head: true }).neq("status", "RESOLVED"),
    db.from("sanctions").select("id", { count: "exact", head: true }).eq("status", "PROPOSED"),
    db.from("feedbacks").select("mood_score, talk_score, venue_score, rejoin_intent, dining_tables(rounds(title, event_date))").limit(2000),
  ]);

  const metrics = (metricsData ?? {}) as Metrics;
  const run = lastRun as { stats: { success_rate?: number; seated?: number; candidates?: number; tables?: number; reallocated?: number } | null; finished_at: string; rounds: { title: string } | { title: string }[] | null } | null;
  const runTitle = one(run?.rounds)?.title;
  const excBy = (...types: string[]) => (openExc ?? []).filter((e) => types.includes(e.type)).length;

  const cards = [
    { icon: Users, label: "결제 완료 신청", value: `${(paidApps ?? 0).toLocaleString()}명`, note: `진행 중 신청 ${(activeApps ?? 0).toLocaleString()}건 중 · 전체 참가자 ${(participants ?? 0).toLocaleString()}명` },
    { icon: CalendarDays, label: "모집 중 회차", value: `${openRounds?.length ?? 0}개`, note: openRounds?.[0] ? (openRounds[0].setting_overrides?.auto_match === false ? `${openRounds[0].title.replace(" 우연한 식탁", "")} · 자동 진행 멈춤(시연 고정)` : `다음 자동 매칭 ${formatKst(openRounds[0].match_run_at)}`) : "예정된 회차 없음" },
    { icon: Percent, label: "최근 매칭", value: run ? `${run.stats?.success_rate ?? 0}%` : "-", note: run ? `${runTitle} · 테이블 ${run.stats?.tables ?? 0}개 · ${run.stats?.seated ?? 0}/${run.stats?.candidates ?? 0}명 · 재배치 ${run.stats?.reallocated ?? 0}건` : "아직 실행 기록 없음" },
    { icon: TriangleAlert, label: "처리할 예외", value: `${openExc?.length ?? 0}건`, note: "매칭 실패·식당 부족 등" },
  ];
  const todo: [string, number, string][] = [
    ["선택 대기 참가자", waiting ?? 0, "/admin/applicants?round=all&match=NEEDS_CHOICE"],
    ["식당 부족", excBy("VENUE_SHORTAGE"), "/admin/exceptions"],
    ["조건 충돌·전원 실패", excBy("CONDITION_CONFLICT", "MATCH_FAILED_ALL"), "/admin/exceptions"],
    ["발송·환불 실패", excBy("DELIVERY_FAILED", "REFUND_FAILED"), "/admin/exceptions"],
    ["노쇼 후보", noshowOpen ?? 0, "/admin/exceptions"],
    ["미처리 신고", reportsOpen ?? 0, "/admin/reports"],
    ["제재 제안", sanctionsProposed ?? 0, "/admin/reports"],
  ];

  // F-69: satisfaction per round, newest first. 재참여 의향 is the share who answered 4 or 5.
  type FB = { mood_score: number; talk_score: number; venue_score: number; rejoin_intent: number; dining_tables: { rounds: { title: string; event_date: string } | { title: string; event_date: string }[] | null } | { rounds: { title: string; event_date: string } | { title: string; event_date: string }[] | null }[] | null };
  const byRound = new Map<string, { date: string; rows: FB[] }>();
  for (const f of (feedbacks ?? []) as unknown as FB[]) {
    const r = one(one(f.dining_tables)?.rounds);
    if (!r) continue;
    const e = byRound.get(r.title) ?? { date: r.event_date, rows: [] };
    e.rows.push(f);
    byRound.set(r.title, e);
  }
  const satisfaction = [...byRound.entries()].sort((a, b) => b[1].date.localeCompare(a[1].date)).slice(0, 8).map(([title, { rows }]) => ({
    title, n: rows.length, mood: avg(rows.map((r) => r.mood_score)), talk: avg(rows.map((r) => r.talk_score)), venue: avg(rows.map((r) => r.venue_score)),
    rejoin: Math.round((rows.filter((r) => r.rejoin_intent >= 4).length / rows.length) * 100),
  }));

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

      <section>
        <h2 className="text-[15px] font-bold">지금 처리할 일</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {todo.map(([label, n, href]) => (
            <Link key={label} href={href} className={`rounded-xl border bg-white p-4 transition hover:border-ink/30 ${n > 0 ? "border-ember/40" : "border-line"}`}>
              <p className="text-[12px] text-muted">{label}</p>
              <p className={`mt-1 text-[22px] font-bold tabular ${n > 0 ? "text-ember" : "text-ink/40"}`}>{n}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-bold">핵심 지표 13종</h2>
        <p className="mt-1 text-[12px] text-muted">분모가 0이면 “-”로 표시해요. 괄호 안은 분자/분모예요.</p>
        <div className={`${cardCls} mt-3`}>
          <table className="w-full text-[13px] tabular">
            <thead className="border-b border-line bg-paper text-left text-[12px] text-muted">
              <tr><th className={thCls}>지표</th><th className={thCls}>값</th><th className={thCls}>계산식</th></tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const v = metrics[m.key];
                return (
                  <tr key={m.key} className="border-t border-line/70">
                    <td className="px-4 py-2.5 font-medium">{m.label}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[15px] font-bold">{m.kind === "secs" ? fmtSecs(v) : fmtRatio(v)}</span>
                      {m.kind !== "secs" && v && v.den > 0 && <span className="ml-2 text-[12px] text-muted">({(v.num ?? 0).toLocaleString()}/{v.den.toLocaleString()})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{m.formula}{m.note && <span className="ml-1 text-[11px]">· {m.note}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-bold">회차별 만족도</h2>
        <p className="mt-1 text-[12px] text-muted">5점 만점 평균이고, 재참여 의향은 4점 이상으로 답한 비율이에요.</p>
        <div className={`${cardCls} mt-3`}>
          <table className="w-full text-[13px] tabular">
            <thead className="border-b border-line bg-paper text-left text-[12px] text-muted">
              <tr><th className={thCls}>회차</th><th className={thCls}>응답</th><th className={thCls}>분위기</th><th className={thCls}>대화</th><th className={thCls}>식당</th><th className={thCls}>재참여 의향</th></tr>
            </thead>
            <tbody>
              {satisfaction.map((s) => (
                <tr key={s.title} className="border-t border-line/70">
                  <td className="px-4 py-2.5 font-medium">{s.title}</td>
                  <td className="px-4 py-2.5">{s.n}명</td><td className="px-4 py-2.5">{s.mood}</td><td className="px-4 py-2.5">{s.talk}</td><td className="px-4 py-2.5">{s.venue}</td>
                  <td className="px-4 py-2.5">{s.rejoin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!satisfaction.length && <p className="px-4 py-8 text-center text-[13px] text-muted">아직 받은 피드백이 없어요.</p>}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["/admin/matching", "매칭 모니터에서 회차별 결과 보기"],
          ["/admin/rounds", "새 회차 만들기"],
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
