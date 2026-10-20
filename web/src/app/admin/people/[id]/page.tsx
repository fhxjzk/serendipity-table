// 참가자별 이력 (F-60, F-67): applications, attendance, feedback, reports, penalties and sanctions of one person.
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ageOf, formatKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls, thCls } from "../../ui";

const ATTEND: Record<string, string> = { SCHEDULED: "참석 예정", ATTENDED: "참석", CANCELED_EARLY: "사전 취소", CANCELED_LATE: "늦은·당일 취소", NO_SHOW: "노쇼" };
const MATCH: Record<string, string> = { WAITING: "매칭 대기", CONFIRMED: "식탁 확정", ALTERNATIVE_OFFERED: "매칭 실패", TRANSFERRED: "일정 이동", NO_MATCH: "매칭 안 됨", EXCEPTION: "확인 중", MATCHING: "매칭 중", REALLOCATING: "자리 조정 중" };
const LEVEL: Record<string, string> = { WARNING: "경고", RESTRICTION: "참가 제한", BAN: "이용 정지" };
const PENALTY: Record<string, string> = { NO_SHOW: "노쇼", SAME_DAY_CANCEL: "당일 불참 알림", LATE_CANCEL: "늦은 취소" };
type Round = { title: string; event_date: string };

export default async function PersonPage({ params }: PageProps<"/admin/people/[id]">) {
  await requireProfile("OPERATOR");
  const { id } = await params;
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id, name, display_name, gender, birth_year, job, mbti, restriction, restricted_until").eq("id", id).maybeSingle();
  if (!p) notFound();

  const [{ data: apps }, { data: feedbacks }, { data: made }, { data: received }, { data: penalties }, { data: sanctions }] = await Promise.all([
    db.from("applications").select("id, match_status, attendance_status, created_at, application_choices(region_code, rounds(title, event_date))").eq("profile_id", id).order("created_at", { ascending: false }),
    db.from("feedbacks").select("application_id, mood_score, talk_score, venue_score").eq("profile_id", id),
    db.from("reports").select("id").eq("reporter_id", id),
    db.from("reports").select("id, reason_code, status, action, created_at").eq("reported_id", id),
    db.from("penalty_records").select("kind, created_at").eq("profile_id", id).order("created_at", { ascending: false }),
    db.from("sanctions").select("level, status, reason, until_date, created_at").eq("profile_id", id).order("created_at", { ascending: false }),
  ]);
  const attended = (apps ?? []).filter((a) => a.attendance_status === "ATTENDED").length;
  const noShows = (apps ?? []).filter((a) => a.attendance_status === "NO_SHOW").length;

  return (
    <main className="flex flex-col gap-6">
      <AdminHeader crumb="참가자" title={`${p.name} 이력`}>
        {p.gender === "F" ? "여" : "남"} · {ageOf(p.birth_year)}세 · {p.job} · {p.mbti === "UNKNOWN" ? "MBTI 모름" : p.mbti} · 표시 이름 {p.display_name}
      </AdminHeader>
      <div className="grid gap-3 sm:grid-cols-5">
        {[["신청", `${apps?.length ?? 0}건`], ["참석", `${attended}회`], ["노쇼", `${noShows}회`], ["받은 신고", `${received?.length ?? 0}건`], ["참가 상태", p.restriction === "NONE" ? "정상" : p.restriction === "RESTRICTED" ? `제한 ~${p.restricted_until ?? ""}` : "정지"]].map(([k, v]) => (
          <div key={k} className={`${cardCls} p-4`}><p className="text-[12px] text-muted">{k}</p><p className="mt-1 text-[18px] font-bold tabular">{v}</p></div>
        ))}
      </div>

      <section className={cardCls}>
        <h2 className="border-b border-line bg-paper px-4 py-2.5 text-[13px] font-bold">신청·참가 이력</h2>
        <table className="w-full text-[13px] tabular">
          <thead className="border-b border-line text-left text-[12px] text-muted"><tr><th className={thCls}>회차</th><th className={thCls}>매칭</th><th className={thCls}>참석</th><th className={thCls}>피드백</th></tr></thead>
          <tbody>
            {(apps ?? []).map((a) => {
              const rounds = [...new Set(((a.application_choices ?? []) as unknown as { rounds: Round | Round[] | null }[]).map((c) => (Array.isArray(c.rounds) ? c.rounds[0] : c.rounds)?.title).filter(Boolean))];
              const fb = (feedbacks ?? []).find((f) => f.application_id === a.id);
              return (
                <tr key={a.id} className="border-t border-line/70">
                  <td className="px-4 py-2.5">{rounds.join(" · ")}</td>
                  <td className="px-4 py-2.5">{MATCH[a.match_status] ?? a.match_status}</td>
                  <td className="px-4 py-2.5">{ATTEND[a.attendance_status] ?? a.attendance_status}</td>
                  <td className="px-4 py-2.5 text-muted">{fb ? `분위기 ${fb.mood_score} · 대화 ${fb.talk_score} · 식당 ${fb.venue_score}` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!apps?.length && <Empty>신청 내역이 없어요.</Empty>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} p-5 text-[13px]`}>
          <h2 className="text-[13px] font-bold">받은 신고 {received?.length ?? 0}건 · 한 신고 {made?.length ?? 0}건</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {(received ?? []).map((r) => <li key={r.id}>{formatKst(r.created_at)} · {r.reason_code} · <Badge tone={r.status === "RESOLVED" ? "green" : "red"}>{r.status === "RESOLVED" ? `처리됨(${r.action ?? "-"})` : "미처리"}</Badge></li>)}
          </ul>
        </section>
        <section className={`${cardCls} p-5 text-[13px]`}>
          <h2 className="text-[13px] font-bold">패널티·제재</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {(penalties ?? []).map((x, i) => <li key={`p${i}`}>{formatKst(x.created_at)} · {PENALTY[x.kind] ?? x.kind}</li>)}
            {(sanctions ?? []).map((s, i) => <li key={`s${i}`}>{formatKst(s.created_at)} · {LEVEL[s.level]} {s.status === "PROPOSED" ? "제안" : s.status === "CONFIRMED" ? "확정" : "반려"} · {s.reason}{s.until_date && ` (~${s.until_date})`}</li>)}
            {!penalties?.length && !sanctions?.length && <li className="text-muted">기록이 없어요.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
