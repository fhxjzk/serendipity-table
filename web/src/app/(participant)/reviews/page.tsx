// S-14 지난 모임 후기 (F-86): public one-line reviews by region. Writers are never named; hidden ones never show.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/participant-ui";
import { TableSeats } from "@/components/table-seats";
import { REGION_LABEL } from "@/lib/format";

const REGIONS = ["HONGDAE", "GANGNAM", "EULJIRO", "JAMSIL"];
const fmt = (d: string) => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(`${d}T12:00:00+09:00`));
type T = { region_code: string; rounds: { event_date: string } | { event_date: string }[] | null };
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  await requireProfile("PARTICIPANT");
  const sp = await searchParams;
  const region = typeof sp.region === "string" && REGIONS.includes(sp.region) ? sp.region : "";
  const { data } = await createAdminClient().from("feedbacks")
    .select("application_id, review_rating, review_text, submitted_at, dining_tables!inner(region_code, rounds(event_date))")
    .eq("review_public", true).eq("review_hidden", false).not("review_text", "is", null)
    .order("submitted_at", { ascending: false }).limit(200);
  const all = (data ?? []).map((r) => ({ ...r, table: one(r.dining_tables as unknown as T | T[] | null) }));
  const shown = (region ? all.filter((r) => r.table?.region_code === region) : all).slice(0, 60);

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="지난 모임 후기" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-16 pt-5">
        <p className="text-[12px] text-muted">참가자가 공개를 고른 후기만 보여 줘요. 작성자 이름은 보이지 않아요.</p>
        <div className="flex flex-wrap gap-2">
          {["", ...REGIONS].map((c) => (
            <Link key={c || "all"} href={c ? `/reviews?region=${c}` : "/reviews"} className={`rounded-full border px-3 py-1.5 text-[13px] ${c === region ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/80"}`}>
              {c ? REGION_LABEL[c] : "전체"} <span className="tabular opacity-70">{c ? all.filter((r) => r.table?.region_code === c).length : all.length}</span>
            </Link>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center pt-8 text-center">
            <TableSeats seats={6} size={84} label="빈 식탁" />
            <p className="mt-2 text-[13px] text-muted">아직 공개된 후기가 없어요.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((r) => (
              <li key={r.application_id} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="text-ember">{"★".repeat(r.review_rating ?? 0)}<span className="text-line">{"★".repeat(5 - (r.review_rating ?? 0))}</span></span>
                  <span>{r.table ? REGION_LABEL[r.table.region_code] : ""}</span>
                  {one(r.table?.rounds)?.event_date && <span>· {fmt(one(r.table?.rounds)!.event_date)}</span>}
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed">{r.review_text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
