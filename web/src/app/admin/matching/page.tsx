// S-25 매칭 모니터: rounds, automatic/instant run status, tables and failures (F-63, F-76).
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FAIL_REASON_TEXT } from "@/lib/matching/reasons";
import type { FailReason } from "@/lib/matching/types";
import { REGION_LABEL, ageOf, formatKst, todayKst } from "@/lib/format";
import { setAutoMatch } from "./actions";
import { ResetButton, RunNowButton } from "./buttons";

const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "모집 중", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  MATCHED: { label: "매칭 완료", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  DONE: { label: "종료", cls: "bg-stone-100 text-stone-600 ring-stone-200" },
  CLOSED: { label: "마감", cls: "bg-stone-100 text-stone-600 ring-stone-200" },
  CANCELED: { label: "취소", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  DRAFT: { label: "준비", cls: "bg-stone-100 text-stone-600 ring-stone-200" },
};
const COMPONENT_LABEL: Record<string, string> = {
  gender_balance: "성비", mbti: "MBTI", interests: "관심사", wanted_traits: "상대 성향", new_people: "새로운 사람",
};

export default async function MatchingPage({ searchParams }: PageProps<"/admin/matching">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const today = todayKst();

  const { data: rounds } = await db
    .from("rounds")
    .select("id, title, event_date, match_run_at, status, setting_overrides")
    .gte("event_date", today)
    .order("event_date");
  const roundIds = (rounds ?? []).map((r) => r.id);

  const [{ data: choices }, { data: runs }] = await Promise.all([
    db.from("application_choices").select("round_id, application_id, applications!inner(is_active, payment_status)").in("round_id", roundIds),
    db.from("match_runs").select("round_id, trigger, status, finished_at, stats").in("round_id", roundIds).order("started_at", { ascending: false }),
  ]);
  const paidCount = (roundId: string) =>
    new Set((choices ?? []).filter((c) => {
      const a = Array.isArray(c.applications) ? c.applications[0] : c.applications;
      return c.round_id === roundId && a?.is_active && ["PAID", "REFUND_AVAILABLE"].includes(a.payment_status);
    }).map((c) => c.application_id)).size;
  const lastRun = (roundId: string) => (runs ?? []).find((r) => r.round_id === roundId);

  const { round: selectedParam } = await searchParams;
  const selected = (rounds ?? []).find((r) => r.id === selectedParam) ?? (rounds ?? []).find((r) => r.status === "MATCHED") ?? rounds?.[0];

  return (
    <main className="flex flex-col gap-8">
      <div>
        <p className="text-[12px] font-medium text-muted">운영 · 자동 매칭</p>
        <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em]">매칭 모니터</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">
          회차의 자동 매칭 실행 시각이 지나면 1분 안에 자동으로 매칭돼요. 시연할 때는 즉시 실행으로 바로 돌리고, 되돌리기로 처음 상태로 돌아갈 수 있어요.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(42,33,27,0.04)]">
        <table className="w-full text-[13px] tabular">
          <thead className="border-b border-line bg-paper text-left text-[12px] text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">회차</th>
              <th className="px-4 py-2.5 font-medium">상태</th>
              <th className="px-4 py-2.5 font-medium">결제 완료 신청</th>
              <th className="px-4 py-2.5 font-medium">자동 실행 시각</th>
              <th className="px-4 py-2.5 font-medium">최근 실행</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(rounds ?? []).map((r) => {
              const run = lastRun(r.id);
              const paused = r.setting_overrides?.auto_match === false;
              return (
                <tr key={r.id} className={`border-t border-line/70 align-top ${selected?.id === r.id ? "bg-sand/40" : ""}`}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/matching?round=${r.id}`} className="font-medium underline-offset-2 hover:underline">{r.title}</Link>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${STATUS[r.status]?.cls ?? ""}`}>{STATUS[r.status]?.label ?? r.status}</span></td>
                  <td className="px-4 py-3 font-medium">{paidCount(r.id)}명</td>
                  <td className="px-4 py-3">
                    <div>{formatKst(r.match_run_at)}</div>
                    <form action={setAutoMatch} className="mt-1">
                      <input type="hidden" name="roundId" value={r.id} />
                      <input type="hidden" name="on" value={paused ? "true" : "false"} />
                      <button className={`text-xs ${paused ? "text-amber-700" : "text-ink/60"} underline`}>
                        {paused ? "자동 실행 멈춤 · 다시 켜기" : "자동 실행 켜짐 · 멈추기"}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {run ? (
                      <>
                        <div>{run.trigger === "SCHEDULER" ? "자동 실행" : "즉시 실행"} · {formatKst(run.finished_at)}</div>
                        <div className="text-xs">테이블 {run.stats?.tables ?? 0} · 배정 {run.stats?.seated ?? 0} · 실패 {run.stats?.failed ?? 0} · 성공률 {run.stats?.success_rate ?? 0}%</div>
                      </>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {r.status === "OPEN" && <RunNowButton roundId={r.id} disabled={paidCount(r.id) === 0} />}
                      {r.status === "MATCHED" && <ResetButton roundId={r.id} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {selected && <RoundDetail roundId={selected.id} title={selected.title} />}
    </main>
  );
}

async function RoundDetail({ roundId, title }: { roundId: string; title: string }) {
  const db = createAdminClient();
  const [{ data: tables }, { data: choiceRows }] = await Promise.all([
    db.from("dining_tables")
      .select("id, region_code, score, score_detail, table_members(left_at, profiles(name, gender, birth_year, mbti))")
      .eq("round_id", roundId).neq("status", "CANCELED").order("score", { ascending: false }),
    db.from("application_choices").select("application_id").eq("round_id", roundId),
  ]);
  const appIds = [...new Set((choiceRows ?? []).map((c) => c.application_id))];
  const { data: failed } = appIds.length
    ? await db.from("applications")
        .select("id, profile_id, match_status, payment_status, reason_code, profiles(name, gender, birth_year), alternative_offers(id)")
        .in("id", appIds).eq("is_active", true).in("match_status", ["ALTERNATIVE_OFFERED", "EXCEPTION"])
    : { data: [] };
  const { data: coupons } = (failed ?? []).length
    ? await db.from("coupons").select("profile_id, discount_rate, valid_until").in("profile_id", (failed ?? []).map((f) => f.profile_id))
    : { data: [] };

  type P = { name: string; gender: string; birth_year: number; mbti?: string };
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold tracking-[-0.02em]">{title} 결과</h2>
      {(tables ?? []).length === 0 && <p className="text-sm text-ink/60">아직 확정된 테이블이 없어요.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(tables ?? []).map((t, i) => {
          const members = (t.table_members ?? []).filter((m) => !m.left_at).map((m) => one(m.profiles as P | P[] | null)).filter(Boolean) as P[];
          const comps = (t.score_detail as { components?: Record<string, number> } | null)?.components ?? {};
          return (
            <div key={t.id} className="rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(42,33,27,0.04)]">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">테이블 {i + 1} · {REGION_LABEL[t.region_code] ?? t.region_code}</h3>
                <span className="text-sm font-semibold text-ember">{Number(t.score).toFixed(1)}점</span>
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {members.map((m, j) => (
                  <li key={j} className="flex justify-between">
                    <span>{m.name}</span>
                    <span className="text-ink/60">{m.gender === "M" ? "남" : "여"} · {ageOf(m.birth_year)}세 · {m.mbti === "UNKNOWN" ? "MBTI 모름" : m.mbti}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink/70">
                {Object.entries(comps).map(([k, v]) => (
                  <span key={k} className="rounded bg-sand/50 px-2 py-0.5">{COMPONENT_LABEL[k] ?? k} {Math.round(v * 100)}%</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {(failed ?? []).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <h3 className="font-semibold">매칭 실패 {failed!.length}명</h3>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {failed!.map((f) => {
              const p = one(f.profiles as P | P[] | null);
              const coupon = (coupons ?? []).find((c) => c.profile_id === f.profile_id);
              return (
                <li key={f.id}>
                  <div className="font-medium">
                    {p?.name} ({p?.gender === "M" ? "남" : "여"} · {p ? ageOf(p.birth_year) : "-"}세)
                    <span className="ml-2 text-xs text-ink/60">
                      대체 일정 {(f.alternative_offers ?? []).length}건 · 환불 가능
                      {coupon ? ` · 보상 쿠폰 ${coupon.discount_rate}% (${coupon.valid_until}까지)` : ""}
                    </span>
                  </div>
                  <div className="text-ink/70">{FAIL_REASON_TEXT[f.reason_code as FailReason] ?? f.reason_code}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
