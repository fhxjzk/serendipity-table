// S-25 매칭 모니터: rounds, automatic/instant run status, tables and failures (F-63, F-76).
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FAIL_REASON_TEXT } from "@/lib/matching/reasons";
import type { FailReason } from "@/lib/matching/types";
import { REGION_LABEL, ageOf, formatKst, todayKst } from "@/lib/format";
import { previewRoundMatching } from "@/lib/matching/run";
import { setAutoMatch } from "./actions";
import { EventStepButton, ResetButton, RunNowButton } from "./buttons";

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
                    <div className="flex flex-wrap justify-end gap-2">
                      {r.status === "OPEN" && <RunNowButton roundId={r.id} disabled={paidCount(r.id) === 0} />}
                      {r.status === "MATCHED" && <EventStepButton roundId={r.id} step="remind" label="전날 리마인드 보내기" />}
                      {r.status === "MATCHED" && <EventStepButton roundId={r.id} step="start" label={r.setting_overrides?.event_started ? "행사 진행 중(다시 게시)" : "행사 시작(체크인·대화 주제)"} />}
                      {r.status === "MATCHED" && <EventStepButton roundId={r.id} step="end" label="행사 종료 처리" />}
                      {r.status === "DONE" && <EventStepButton roundId={r.id} step="noshow" label="노쇼 확정(시연)" />}
                      {(r.status === "MATCHED" || r.status === "DONE") && <ResetButton roundId={r.id} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {selected && selected.status === "OPEN" && <Preview roundId={selected.id} title={selected.title} />}
      {selected && selected.status !== "OPEN" && <RunInfo roundId={selected.id} />}
      {selected && <RoundDetail roundId={selected.id} title={selected.title} />}
    </main>
  );
}

const EVENT_LABEL: Record<string, string> = {
  PLACED: "배치", RELEASED: "해제", REALLOCATED: "재배치", SPLIT: "분리", MERGED: "병합", CONFIRMED: "확정", FAILED: "실패", SHRINK: "인원 감소",
};

// F-62: what the engine would do right now with the paid applications. Nothing is saved.
async function Preview({ roundId, title }: { roundId: string; title: string }) {
  const { result, stats, names, settings } = await previewRoundMatching(createAdminClient(), roundId);
  const who = (profileId: string) => {
    const p = names.get(profileId);
    return p ? `${p.name}(${p.gender === "M" ? "남" : "여"}·${ageOf(p.birth_year)})` : "-";
  };
  return (
    <section className="rounded-xl border border-dashed border-sky-300 bg-sky-50/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-[-0.02em]">{title} 매칭 미리보기</h2>
        <span className="text-xs text-ink/60">저장하지 않는 계산이에요 · 최소 점수 {settings.minScore} · 나이 차이 {settings.maxAgeGap}살 이내 · {settings.tableMin}~{settings.tableMax}명</span>
      </div>
      {stats.candidates === 0 ? (
        <p className="mt-3 text-sm text-ink/60">아직 결제를 마친 신청이 없어요.</p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            후보 {stats.candidates}명 → 예상 테이블 <b>{stats.tables}개</b> · 배정 {stats.seated}명 · 예상 실패 <b>{stats.failed}명</b> · 다른 날짜 대기 {stats.waiting}명 · 예상 성공률 {stats.success_rate}%
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {result.tables.map((t, i) => (
              <div key={i} className="rounded-lg border border-line bg-white p-4 text-sm">
                <div className="flex justify-between font-semibold"><span>예상 테이블 {i + 1} · {REGION_LABEL[t.regionCode]}</span><span className="text-ember">{t.score.total.toFixed(1)}점</span></div>
                <p className="mt-1 text-ink/70">{t.members.map((m) => who(m.profileId)).join(", ")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink/70">
                  {Object.entries(t.score.components).map(([k, v]) => <span key={k} className="rounded bg-sand/50 px-2 py-0.5">{COMPONENT_LABEL[k] ?? k} {Math.round(v * 100)}%</span>)}
                </div>
              </div>
            ))}
          </div>
          {result.failures.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {result.failures.map((f) => (
                <li key={f.candidate.applicationId}>
                  <span className="font-medium">{who(f.candidate.profileId)}</span>
                  <span className="ml-2 text-ink/70">{f.waitsForLaterRound ? "다른 날짜 매칭 대기" : FAIL_REASON_TEXT[f.reason]}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// F-63: how the saved run was made — algorithm, criteria, and every placement change.
async function RunInfo({ roundId }: { roundId: string }) {
  const db = createAdminClient();
  const { data: run } = await db.from("match_runs").select("id, trigger, algorithm_version, settings_snapshot, stats, finished_at")
    .eq("round_id", roundId).eq("status", "DONE").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return null;
  const { data: events } = await db.from("match_events").select("event_type, reason_code, application_id, applications(profiles(name))").eq("match_run_id", run.id);
  const counts = new Map<string, number>();
  for (const e of events ?? []) counts.set(e.event_type, (counts.get(e.event_type) ?? 0) + 1);
  const moves = (events ?? []).filter((e) => ["RELEASED", "REALLOCATED", "SPLIT", "MERGED"].includes(e.event_type));
  const s = run.settings_snapshot as { weights?: Record<string, number>; minScore?: number; maxAgeGap?: number } | null;
  type AppP = { profiles: { name: string } | { name: string }[] | null } | { profiles: { name: string } | { name: string }[] | null }[] | null;
  const nameOf = (a: AppP) => {
    const app = Array.isArray(a) ? a[0] : a;
    const p = Array.isArray(app?.profiles) ? app?.profiles[0] : app?.profiles;
    return p?.name ?? "-";
  };
  return (
    <section className="rounded-xl border border-line bg-white p-5 text-sm shadow-[0_1px_2px_rgba(42,33,27,0.04)]">
      <h2 className="text-[15px] font-bold">실행 기록</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-xs text-muted">알고리즘</dt><dd>{run.algorithm_version} · {run.trigger === "SCHEDULER" ? "자동 실행" : "즉시 실행"} · {formatKst(run.finished_at)}</dd></div>
        <div><dt className="text-xs text-muted">적용 기준</dt><dd>최소 점수 {s?.minScore ?? "-"} · 나이 차이 {s?.maxAgeGap ?? "-"}살 이내 · 가중치 {Object.entries(s?.weights ?? {}).map(([k, v]) => `${COMPONENT_LABEL[k] ?? k} ${v}`).join(" / ")}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {[...counts.entries()].map(([k, n]) => <span key={k} className="rounded bg-sand/60 px-2 py-0.5">{EVENT_LABEL[k] ?? k} {n}건</span>)}
      </div>
      {moves.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-ink/80">
          {moves.map((e, i) => <li key={i}>{nameOf(e.applications as AppP)} — {EVENT_LABEL[e.event_type]} ({e.reason_code})</li>)}
        </ul>
      )}
    </section>
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
