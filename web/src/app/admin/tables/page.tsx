// S-24 테이블 조회 (F-64): every table of a round with its venue, score and members.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGION_LABEL, ageOf, todayKst } from "@/lib/format";
import { AdminHeader, Badge, Empty, cardCls } from "../ui";

type Profile = { name: string; birth_year: number; gender: string; mbti: string; job: string };
type Venue = { name: string; address: string };
type Member = { left_at: string | null; profiles: Profile | Profile[] | null };
type TableRow = {
  id: string; region_code: string; status: string; score: number | null; reservation_name: string | null; curation: string | null;
  venues: Venue | Venue[] | null;
  table_members: Member[];
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function TablesPage({ searchParams }: PageProps<"/admin/tables">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const sp = await searchParams;
  const { data: rounds } = await db.from("rounds").select("id, title, status").gte("event_date", todayKst()).in("status", ["MATCHED", "DONE"]).order("event_date");
  const roundId = (typeof sp.round === "string" && sp.round) || rounds?.[0]?.id || "";

  const { data } = roundId
    ? await db.from("dining_tables")
      .select("id, region_code, status, score, reservation_name, curation, venues(name, address), table_members(left_at, profiles(name, birth_year, gender, mbti, job))")
      .eq("round_id", roundId).order("region_code").order("score", { ascending: false })
    : { data: [] };
  const tables = (data ?? []) as unknown as TableRow[];

  return (
    <main className="flex flex-col gap-6">
      <AdminHeader crumb="테이블" title="테이블 조회">확정된 테이블의 식당, 예약명, 매칭 점수, 구성원을 한눈에 확인해요.</AdminHeader>
      <div className="flex flex-wrap gap-2">
        {(rounds ?? []).map((r) => (
          <Link key={r.id} href={`/admin/tables?round=${r.id}`} className={`rounded-full border px-3 py-1.5 text-[13px] ${r.id === roundId ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/80 hover:bg-paper"}`}>{r.title}</Link>
        ))}
        {!rounds?.length && <p className="text-[13px] text-muted">매칭이 끝난 회차가 아직 없어요. 매칭 모니터에서 즉시 실행해 보세요.</p>}
      </div>
      {tables.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {tables.map((t) => {
            const venue = one(t.venues);
            const members = t.table_members.filter((m) => !m.left_at);
            return (
              <section key={t.id} className={`${cardCls} p-5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-bold">{venue?.name ?? "식당 미배정"}</h2>
                  <Badge tone={venue ? "green" : "red"}>{venue ? "확정" : "식당 부족"}</Badge>
                  <span className="ml-auto text-[12px] text-muted tabular">점수 {t.score ?? "-"}</span>
                </div>
                <p className="mt-1 text-[12px] text-muted">{REGION_LABEL[t.region_code]}{venue && ` · ${venue.address}`}{t.reservation_name && ` · 예약명 ${t.reservation_name}`}</p>
                <ul className="mt-4 divide-y divide-line/70 text-[13px]">
                  {members.map((m, i) => {
                    const p = one(m.profiles);
                    return (
                      <li key={i} className="flex items-center gap-3 py-2">
                        <span className="w-16 font-medium">{p?.name}</span>
                        <span className="text-muted tabular">{p ? `${ageOf(p.birth_year)}세 · ${p.gender === "F" ? "여" : "남"} · ${p.mbti === "UNKNOWN" ? "MBTI 미상" : p.mbti}` : ""}</span>
                        <span className="ml-auto text-muted">{p?.job}</span>
                      </li>
                    );
                  })}
                </ul>
                {t.curation && <p className="mt-3 rounded-lg bg-sand/50 px-3 py-2 text-[12px] leading-relaxed text-ink/80">{t.curation}</p>}
              </section>
            );
          })}
        </div>
      )}
      {roundId && !tables.length && <section className={cardCls}><Empty>이 회차에는 확정된 테이블이 없어요.</Empty></section>}
    </main>
  );
}
