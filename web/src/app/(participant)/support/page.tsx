// S-15 FAQ·1:1 문의 (F-85): answers first, then the inquiry form and my past inquiries.
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/participant-ui";
import { InquiryForm } from "./inquiry-form";

const CATEGORY: Record<string, string> = { PAYMENT_REFUND: "결제·환불", MATCHING: "매칭", SCHEDULE: "일정", CANCEL: "취소·불참", ETC: "기타" };
const STATUS: Record<string, string> = { OPEN: "답변 확인 전", AUTO_RESOLVED: "자동 해결", ESCALATED: "운영자 확인 중", ANSWERED: "답변 완료" };
const fmt = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(iso));

export default async function SupportPage() {
  const { profile } = await requireProfile("PARTICIPANT");
  const db = createAdminClient();
  const [{ data: faqs }, { data: mine }] = await Promise.all([
    db.from("faq_items").select("id, category, question, answer").eq("active", true).order("sort_order"),
    db.from("inquiries").select("id, category, body, status, answer, created_at").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const groups = Object.keys(CATEGORY).map((c) => ({ code: c, items: (faqs ?? []).filter((f) => f.category === c) })).filter((g) => g.items.length);

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="FAQ · 문의" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 px-5 pb-16 pt-5">
        <section>
          <h2 className="text-[15px] font-bold">자주 묻는 질문</h2>
          <div className="mt-3 flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.code}>
                <p className="mb-2 text-[12px] font-semibold text-muted">{CATEGORY[g.code]}</p>
                <div className="flex flex-col gap-2">
                  {g.items.map((f) => (
                    <details key={f.id} className="group rounded-2xl border border-line bg-white px-4 py-3">
                      <summary className="cursor-pointer list-none text-[14px] font-medium marker:hidden">{f.question}</summary>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink/80">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-[15px] font-bold">1:1 문의</h2>
          <p className="mb-3 mt-1 text-[12px] text-muted">내 신청 상태를 보고 먼저 자동으로 답해 드려요. 그래도 풀리지 않으면 운영자에게 보낼 수 있어요.</p>
          <InquiryForm />
        </section>

        {!!mine?.length && (
          <section>
            <h2 className="text-[15px] font-bold">내 문의</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {mine.map((q) => (
                <li key={q.id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <span>{CATEGORY[q.category]}</span><span>·</span><span>{fmt(q.created_at)}</span>
                    <span className="ml-auto rounded-full bg-sand px-2 py-0.5 text-[11px] text-ink/70">{STATUS[q.status]}</span>
                  </div>
                  <p className="mt-1.5 text-[13px]">{q.body}</p>
                  {q.answer && q.status !== "ESCALATED" && <p className="mt-2 rounded-lg bg-sand/60 px-3 py-2 text-[12px] leading-relaxed text-ink/80">{q.answer}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
