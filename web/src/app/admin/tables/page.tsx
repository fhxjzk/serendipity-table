// S-27 테이블·식당·단체방 조회 (F-64, F-04, F-69, F-75): members, venue, food conditions, chat room,
// what was sent to whom, satisfaction, and every status change of the table's people.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGION_LABEL, ageOf, formatKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls } from "../ui";

type Profile = { name: string; birth_year: number; gender: string; mbti: string; job: string };
type Venue = { name: string; address: string };
type Member = { application_id: string; left_at: string | null; left_reason: string | null; profiles: Profile | Profile[] | null };
type Room = { id: string; chat_messages: { count: number }[] };
type TableRow = {
  id: string; region_code: string; status: string; score: number | null; reservation_name: string | null; curation: string | null; food_summary: string | null;
  venues: Venue | Venue[] | null; table_members: Member[]; chat_rooms: Room | Room[] | null;
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const FIELD: Record<string, string> = { APPLICATION: "신청", PAYMENT: "결제", MATCH: "매칭", ATTENDANCE: "참석" };
const SENT: [string, string][] = [["confirm:", "확정 안내"], ["reminder:", "전날 리마인드"], ["start:", "대화 주제"], ["feedback:", "피드백 요청"]];
const STATUS: Record<string, { label: string; tone: "green" | "gray" | "red" }> = {
  CONFIRMED: { label: "확정", tone: "green" }, DONE: { label: "행사 종료", tone: "gray" }, CANCELED: { label: "취소", tone: "red" },
};

export default async function TablesPage({ searchParams }: PageProps<"/admin/tables">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const sp = await searchParams;
  const { data: rounds } = await db.from("rounds").select("id, title, status").in("status", ["MATCHED", "DONE"]).order("event_date", { ascending: false }).limit(8);
  const roundId = (typeof sp.round === "string" && sp.round) || rounds?.[0]?.id || "";

  const { data } = roundId
    ? await db.from("dining_tables")
      .select("id, region_code, status, score, reservation_name, curation, food_summary, venues(name, address), table_members(application_id, left_at, left_reason, profiles(name, birth_year, gender, mbti, job)), chat_rooms(id, chat_messages(count))")
      .eq("round_id", roundId).order("status").order("score", { ascending: false })
    : { data: [] };
  const tables = (data ?? []) as unknown as TableRow[];
  const appIds = tables.flatMap((t) => t.table_members.map((m) => m.application_id));
  const [{ data: sent }, { data: feedbacks }, { data: history }] = appIds.length
    ? await Promise.all([
        db.from("notifications").select("dedupe_key, read_at").in("dedupe_key", SENT.flatMap(([k]) => appIds.map((a) => k + a))),
        db.from("feedbacks").select("table_id, mood_score, talk_score, venue_score, rejoin_intent").in("table_id", tables.map((t) => t.id)),
        db.from("status_history").select("application_id, field, from_value, to_value, actor_type, reason, created_at").in("application_id", appIds).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "-");

  return (
    <main className="flex flex-col gap-6">
      <AdminHeader crumb="테이블" title="테이블·식당·단체방 조회">
        테이블마다 구성원, 식당·예약명, 식사 조건, 단체방, 안내 발송 현황, 만족도, 상태 변경 이력을 한 번에 확인해요.
      </AdminHeader>
      <div className="flex flex-wrap items-center gap-2">
        {(rounds ?? []).map((r) => (
          <Link key={r.id} href={`/admin/tables?round=${r.id}`} className={`rounded-full border px-3 py-1.5 text-[13px] ${r.id === roundId ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/80 hover:bg-paper"}`}>{r.title}</Link>
        ))}
        {roundId && <a href={`/admin/export/tables?round=${roundId}`} className="ml-auto text-[13px] text-ink/70 underline">이 회차 테이블 CSV 내려받기</a>}
      </div>
      {tables.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {tables.map((t) => {
            const venue = one(t.venues);
            const room = one(t.chat_rooms);
            const members = t.table_members.filter((m) => !m.left_at);
            const left = t.table_members.filter((m) => m.left_at);
            const ids = t.table_members.map((m) => m.application_id);
            const nameOf = (app: string) => one(t.table_members.find((m) => m.application_id === app)?.profiles)?.name ?? "-";
            const fbs = (feedbacks ?? []).filter((f) => f.table_id === t.id);
            const hist = (history ?? []).filter((h) => ids.includes(h.application_id));
            return (
              <section key={t.id} className={`${cardCls} p-5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-bold">{venue?.name ?? "식당 미배정"}</h2>
                  <Badge tone={venue ? STATUS[t.status]?.tone ?? "gray" : "red"}>{venue ? STATUS[t.status]?.label ?? t.status : "식당 부족"}</Badge>
                  <span className="ml-auto text-[12px] text-muted tabular">점수 {t.score ?? "-"}</span>
                </div>
                <p className="mt-1 text-[12px] text-muted">{REGION_LABEL[t.region_code]}{venue && ` · ${venue.address}`}{t.reservation_name && ` · 예약명 ${t.reservation_name}`}</p>
                <ul className="mt-4 divide-y divide-line/70 text-[13px]">
                  {members.map((m) => {
                    const p = one(m.profiles);
                    return (
                      <li key={m.application_id} className="flex items-center gap-3 py-2">
                        <span className="w-16 font-medium">{p?.name}</span>
                        <span className="text-muted tabular">{p ? `${ageOf(p.birth_year)}세 · ${p.gender === "F" ? "여" : "남"} · ${p.mbti === "UNKNOWN" ? "MBTI 미상" : p.mbti}` : ""}</span>
                        <span className="ml-auto text-muted">{p?.job}</span>
                      </li>
                    );
                  })}
                </ul>
                {left.length > 0 && <p className="mt-1 text-[12px] text-muted">빠진 사람: {left.map((m) => `${one(m.profiles)?.name}(${m.left_reason === "CANCELED" ? "취소" : m.left_reason === "REALLOCATED" ? "다른 식탁으로" : "테이블 취소"})`).join(", ")}</p>}
                {t.food_summary && <p className="mt-3 whitespace-pre-line rounded-lg border border-line px-3 py-2 text-[12px] leading-relaxed">{t.food_summary}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                  <span className="rounded bg-sand/60 px-2 py-0.5">단체방 {room ? `메시지 ${room.chat_messages?.[0]?.count ?? 0}개` : "없음"}</span>
                  {SENT.map(([k, label]) => {
                    const rows = (sent ?? []).filter((s) => ids.some((a) => s.dedupe_key === k + a));
                    if (!rows.length) return null;
                    return <span key={k} className="rounded bg-sand/60 px-2 py-0.5">{label} {rows.length}명 · 읽음 {rows.filter((r) => r.read_at).length}</span>;
                  })}
                </div>
                {fbs.length > 0 && (
                  <p className="mt-2 text-[12px] text-ink/80">
                    만족도 {fbs.length}명 응답 · 분위기 {avg(fbs.map((f) => f.mood_score))} · 대화 {avg(fbs.map((f) => f.talk_score))} · 식당 {avg(fbs.map((f) => f.venue_score))} · 재참여 의향 {Math.round((fbs.filter((f) => f.rejoin_intent >= 4).length / fbs.length) * 100)}%
                  </p>
                )}
                {t.curation && <p className="mt-3 rounded-lg bg-sand/50 px-3 py-2 text-[12px] leading-relaxed text-ink/80">{t.curation}</p>}
                {hist.length > 0 && (
                  <details className="mt-3 text-[12px]">
                    <summary className="cursor-pointer text-ink/70">상태 변경 이력 {hist.length}건</summary>
                    <ul className="mt-2 flex flex-col gap-1 text-ink/80">
                      {hist.map((h, i) => (
                        <li key={i} className="tabular">{formatKst(h.created_at)} · {nameOf(h.application_id)} · {FIELD[h.field] ?? h.field} {h.from_value ?? "-"} → {h.to_value} <span className="text-muted">({h.actor_type === "SYSTEM" ? "시스템" : h.actor_type === "PARTICIPANT" ? "본인" : "운영자"} · {h.reason})</span></li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
      {!rounds?.length && <p className="text-[13px] text-muted">매칭이 끝난 회차가 아직 없어요.</p>}
      {roundId && !tables.length && <section className={cardCls}><Empty>이 회차에는 테이블이 없어요.</Empty></section>}
    </main>
  );
}
