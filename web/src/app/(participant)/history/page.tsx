// S-10 참가 이력·다음 일정 (F-51, F-52): past dates, regions, attendance and feedback, and a next round
// picked from the regions this person chose or dined in before. Applying reuses the saved profile.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, primaryButton } from "@/components/participant-ui";
import { TableSeats } from "@/components/table-seats";
import { REGION_LABEL } from "@/lib/format";

const fmt = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(iso));
const RESULT: Record<string, { label: string; cls: string }> = {
  ATTENDED: { label: "참석", cls: "bg-emerald-50 text-emerald-800" },
  NO_SHOW: { label: "노쇼", cls: "bg-rose-50 text-rose-700" },
  CANCELED_EARLY: { label: "사전 취소", cls: "bg-stone-100 text-stone-600" },
  CANCELED_LATE: { label: "늦은·당일 취소", cls: "bg-amber-50 text-amber-800" },
};
type Round = { id: string; start_at: string; status: string };
type Choice = { region_code: string; rounds: Round | Round[] | null };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function HistoryPage() {
  const { profile } = await requireProfile("PARTICIPANT");
  const db = createAdminClient();
  const [{ data: apps }, { data: feedbacks }, { data: open }] = await Promise.all([
    db.from("applications").select("id, match_status, attendance_status, is_active, table_id, dining_tables(region_code, venues(name), table_members(count), rounds(start_at)), application_choices(region_code, rounds(id, start_at, status))")
      .eq("profile_id", profile.id).order("created_at", { ascending: false }),
    db.from("feedbacks").select("application_id, mood_score").eq("profile_id", profile.id),
    db.from("rounds").select("id, start_at, round_regions(region_code, capacity)").eq("status", "OPEN").gt("apply_deadline_at", new Date().toISOString()).order("event_date"),
  ]);

  // Finished ones: a seat was held, or the person cancelled or did not come.
  const past = (apps ?? []).filter((a) => !a.is_active && (a.match_status === "CONFIRMED" || a.attendance_status !== "SCHEDULED"));
  const active = (apps ?? []).find((a) => a.is_active);
  const rows = past.map((a) => {
    type T = { region_code: string; venues: { name: string } | { name: string }[] | null; table_members: { count: number }[] | null; rounds: { start_at: string } | { start_at: string }[] | null };
    const table = one(a.dining_tables as unknown as T | T[] | null);
    const mine = (feedbacks ?? []).find((f) => f.application_id === a.id);
    const choices = (a.application_choices ?? []) as unknown as Choice[];
    const when = one(table?.rounds)?.start_at ?? choices.map((c) => one(c.rounds)?.start_at).filter(Boolean).sort()[0] ?? null;
    return {
      id: a.id, when, region: table?.region_code ?? choices[0]?.region_code ?? null, result: a.attendance_status,
      feedback: !!mine, mood: mine?.mood_score ?? null,
      venue: one(table?.venues)?.name ?? null, people: table?.table_members?.[0]?.count ?? null,
    };
  });

  // F-52: regions weighted by where the person dined (x2) and what they chose (x1).
  const weight = new Map<string, number>();
  for (const a of apps ?? []) {
    for (const c of (a.application_choices ?? []) as unknown as Choice[]) if (c.region_code !== "ETC") weight.set(c.region_code, (weight.get(c.region_code) ?? 0) + 1);
    const t = one(a.dining_tables as { region_code: string } | { region_code: string }[] | null);
    if (t && a.attendance_status === "ATTENDED") weight.set(t.region_code, (weight.get(t.region_code) ?? 0) + 2);
  }
  const liked = [...weight.entries()].sort((x, y) => y[1] - x[1]).map(([code]) => code);
  const offers = (open ?? []).map((r) => {
    const regions = ((r.round_regions ?? []) as { region_code: string; capacity: number }[]).filter((g) => g.capacity > 0 && g.region_code !== "ETC").map((g) => g.region_code);
    const match = liked.filter((c) => regions.includes(c)).slice(0, 2);
    return { id: r.id, start_at: r.start_at, regions: match.length ? match : regions.slice(0, 2), score: match.reduce((n, c) => n + (weight.get(c) ?? 0), 0) };
  }).sort((x, y) => y.score - x.score || x.start_at.localeCompare(y.start_at));
  const pick = offers[0];
  const lastResult = rows[0]?.result;

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="참가 이력" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pb-16 pt-5">
        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="text-[12px] font-semibold text-ember">다음 식탁 추천</p>
          {active ? (
            <p className="mt-2 text-[14px]">지금 진행 중인 신청이 있어요. 홈에서 상태를 확인해 주세요.</p>
          ) : pick ? (
            <>
              <h2 className="mt-1 text-[18px] font-bold">{fmt(pick.start_at)} · {pick.regions.map((c) => REGION_LABEL[c]).join(", ")}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink/75">
                {liked.length ? "지난번에 고르고 다녀온 지역을 기준으로 골랐어요." : "가장 가까운 모집 일정이에요."}
                {lastResult === "NO_SHOW" && " 지난번엔 참석하지 못하셨어요. 이번엔 못 오게 되면 미리 알려 주세요."}
                {" "}저장된 프로필 그대로 신청돼요.
              </p>
              <Link href={`/rounds?round=${pick.id}&regions=${pick.regions.join(",")}`} className={`${primaryButton} mt-4`}>이 일정으로 신청하기</Link>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-muted">지금 모집 중인 일정이 없어요. 새 회차가 열리면 알려 드릴게요.</p>
          )}
        </section>

        <section>
          <h2 className="text-[15px] font-bold">지난 식탁 {rows.length}번</h2>
          {rows.length === 0 ? (
            <div className="mt-3 flex flex-col items-center rounded-2xl border border-dashed border-line py-6 text-center">
              <TableSeats seats={4} size={72} label="빈 식탁" />
              <p className="mt-2 text-[13px] text-muted">아직 다녀온 식탁이 없어요.</p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {rows.map((r) => {
                const res = RESULT[r.result] ?? { label: "참석 예정", cls: "bg-sky-50 text-sky-800" };
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold">{r.when ? fmt(r.when) : "-"}</p>
                      <p className="text-[12px] text-muted">{[r.venue ?? (r.region ? REGION_LABEL[r.region] : null), r.people ? `${r.people}명` : null].filter(Boolean).join(" · ") || "-"}</p>
                      <p className="mt-0.5 text-[12px] text-muted">{r.mood ? <>내 만족도 <span className="text-ember">{"★".repeat(r.mood)}</span></> : r.feedback ? "피드백 제출함" : "피드백 안 함"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${res.cls}`}>{res.label}</span>
                    {r.result === "ATTENDED" && !r.feedback && <Link href={`/applications/${r.id}/feedback`} className="text-[12px] text-ember underline">피드백</Link>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
