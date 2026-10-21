// S-23 신청자 목록 (F-60): filter by round, region, match status and name.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGION_LABEL, ageOf, formatKst, todayKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls, inputCls, thCls, btnCls } from "../ui";

const MATCH: Record<string, { label: string; tone: "blue" | "green" | "gray" | "red" | "amber" }> = {
  WAITING: { label: "매칭 대기", tone: "blue" }, MATCHING: { label: "매칭 중", tone: "blue" }, REALLOCATING: { label: "자리 조정 중", tone: "amber" },
  CONFIRMED: { label: "식탁 확정", tone: "green" }, ALTERNATIVE_OFFERED: { label: "매칭 실패", tone: "red" }, TRANSFERRED: { label: "일정 이동", tone: "gray" },
  NO_MATCH: { label: "매칭 안 됨", tone: "gray" }, EXCEPTION: { label: "확인 중", tone: "amber" },
};
const PAY: Record<string, { label: string; tone: "blue" | "green" | "gray" | "red" | "amber" }> = {
  PENDING: { label: "결제 대기", tone: "amber" }, PAID: { label: "결제 완료", tone: "green" }, REFUND_AVAILABLE: { label: "환불 가능", tone: "blue" },
  REFUNDED: { label: "환불됨", tone: "gray" }, EXPIRED: { label: "기한 만료", tone: "red" },
};
const LIMIT = 150;

type Profile = { name: string; birth_year: number; gender: string; job: string };
type Row = {
  region_code: string; round_id: string;
  applications: {
    id: string; profile_id: string; payment_status: string; match_status: string; attendance_status: string; ticket_product_code: string | null; submitted_at: string | null; is_active: boolean;
    profiles: Profile | Profile[] | null;
  } | null;
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function ApplicantsPage({ searchParams }: PageProps<"/admin/applicants">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const { data: rounds } = await db.from("rounds").select("id, title, event_date, status").gte("event_date", todayKst()).order("event_date");
  // "all" = every round (used by the dashboard's to-do links); no choice = the nearest round.
  const allRounds = pick("round") === "all";
  const roundId = allRounds ? "" : pick("round") || rounds?.[0]?.id || "";
  const region = pick("region");
  const match = pick("match");
  const q = pick("q").trim();

  let query = db.from("application_choices")
    .select("region_code, round_id, applications!inner(id, profile_id, payment_status, match_status, attendance_status, ticket_product_code, submitted_at, is_active, profiles(name, birth_year, gender, job))")
    .eq("applications.is_active", true).eq("applications.application_status", "SUBMITTED");
  if (roundId) query = query.eq("round_id", roundId);
  if (region) query = query.eq("region_code", region);
  if (match === "NEEDS_CHOICE") query = query.in("applications.match_status", ["ALTERNATIVE_OFFERED", "EXCEPTION"]);
  else if (match) query = query.eq("applications.match_status", match);
  const { data } = await query.limit(1000);
  // One row per application, with every round and region it chose.
  const grouped = new Map<string, { applications: NonNullable<Row["applications"]>; regions: string[]; roundIds: string[] }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.applications) continue;
    const g = grouped.get(r.applications.id) ?? { applications: r.applications, regions: [], roundIds: [] };
    if (!g.regions.includes(r.region_code)) g.regions.push(r.region_code);
    if (!g.roundIds.includes(r.round_id)) g.roundIds.push(r.round_id);
    grouped.set(r.applications.id, g);
  }
  let rows = [...grouped.values()];
  if (q) rows = rows.filter((r) => one(r.applications.profiles)?.name.includes(q));
  rows.sort((a, b) => (a.applications.submitted_at ?? "").localeCompare(b.applications.submitted_at ?? ""));
  const roundTitle = (id: string) => (rounds ?? []).find((r) => r.id === id)?.title.replace(" 우연한 식탁", "") ?? "지난 회차";
  const shown = rows.slice(0, LIMIT);

  // Past attendance and reports received, per person on this page (F-60).
  const profileIds = [...new Set(shown.map((r) => r.applications.profile_id))];
  const [{ data: history }, { data: reports }] = profileIds.length
    ? await Promise.all([
        db.from("applications").select("profile_id, attendance_status").in("profile_id", profileIds).in("attendance_status", ["ATTENDED", "NO_SHOW"]),
        db.from("reports").select("reported_id").in("reported_id", profileIds),
      ])
    : [{ data: [] }, { data: [] }];
  const past = (pid: string, s: string) => (history ?? []).filter((h) => h.profile_id === pid && h.attendance_status === s).length;
  const reported = (pid: string) => (reports ?? []).filter((r) => r.reported_id === pid).length;

  return (
    <main className="flex flex-col gap-6">
      <AdminHeader crumb="신청" title="신청자 목록">회차·지역·매칭 상태·이름으로 좁혀 볼 수 있어요. 운영자에게만 실명이 보여요.</AdminHeader>
      <form className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-muted">회차
          <select name="round" defaultValue={allRounds ? "all" : roundId} className={inputCls}><option value="all">전체 회차</option>{(rounds ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">지역
          <select name="region" defaultValue={region} className={inputCls}><option value="">전체</option>{Object.entries(REGION_LABEL).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">매칭 상태
          <select name="match" defaultValue={match} className={inputCls}><option value="">전체</option><option value="NEEDS_CHOICE">선택 대기 (매칭 실패·확인 중)</option>{Object.entries(MATCH).map(([c, m]) => <option key={c} value={c}>{m.label}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">이름
          <input name="q" defaultValue={q} placeholder="이름 검색" className={inputCls} />
        </label>
        <button className={btnCls}>조회</button>
        <Link href="/admin/applicants" className="pb-2 text-[12px] text-muted underline">초기화</Link>
      </form>
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted">총 <span className="font-semibold text-ink tabular">{rows.length.toLocaleString()}</span>명{rows.length > LIMIT && ` 중 앞의 ${LIMIT}명`}
          {match === "NEEDS_CHOICE" && " · 매칭에 실패해 일정 이동·이용권 보관·환불 중 선택을 기다리는 참가자예요. 참가자 이름을 누르면 이력을 볼 수 있어요."}</p>
        {roundId && <a href={`/admin/export/applicants?round=${roundId}`} className="text-[13px] text-ink/70 underline">이 회차 신청자 CSV 내려받기</a>}
      </div>
      <section className={cardCls}>
        <table className="w-full text-[13px] tabular">
          <thead className="border-b border-line bg-paper text-left text-[12px] text-muted">
            <tr><th className={thCls}>이름</th><th className={thCls}>나이·성별</th><th className={thCls}>직업</th>{allRounds && <th className={thCls}>회차</th>}<th className={thCls}>지역</th><th className={thCls}>결제</th><th className={thCls}>매칭</th><th className={thCls}>이전 참석·노쇼</th><th className={thCls}>받은 신고</th><th className={thCls}>신청 시각</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const a = r.applications;
              const p = one(a.profiles);
              return (
                <tr key={a.id} className="border-t border-line/70">
                  <td className="px-4 py-2.5"><Link href={`/admin/people/${a.profile_id}`} className="font-medium underline-offset-2 hover:underline">{p?.name}</Link></td>
                  <td className="px-4 py-2.5">{p ? `${ageOf(p.birth_year)}세 · ${p.gender === "F" ? "여" : "남"}` : "-"}</td>
                  <td className="px-4 py-2.5 text-muted">{p?.job}</td>
                  {allRounds && <td className="px-4 py-2.5">{r.roundIds.map(roundTitle).join(" · ")}</td>}
                  <td className="px-4 py-2.5">{r.regions.map((c) => REGION_LABEL[c] ?? c).join(" · ")}</td>
                  <td className="px-4 py-2.5"><Badge tone={PAY[a.payment_status]?.tone}>{PAY[a.payment_status]?.label ?? a.payment_status}</Badge></td>
                  <td className="px-4 py-2.5"><Badge tone={MATCH[a.match_status]?.tone}>{MATCH[a.match_status]?.label ?? a.match_status}</Badge></td>
                  <td className="px-4 py-2.5">{past(a.profile_id, "ATTENDED")}회 · <span className={past(a.profile_id, "NO_SHOW") ? "text-ember" : ""}>노쇼 {past(a.profile_id, "NO_SHOW")}</span></td>
                  <td className={`px-4 py-2.5 ${reported(a.profile_id) ? "text-ember" : "text-muted"}`}>{reported(a.profile_id)}건</td>
                  <td className="px-4 py-2.5 text-muted">{formatKst(a.submitted_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <Empty>조건에 맞는 신청이 없어요.</Empty>}
      </section>
    </main>
  );
}
