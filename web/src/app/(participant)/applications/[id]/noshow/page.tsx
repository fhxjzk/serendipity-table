// 노쇼 후보 확인·이의 제기 (F-55).
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/participant-ui";
import { NoshowForm } from "./noshow-form";

const fmt = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

const RESULT: Record<string, { title: string; body: string }> = {
  ATTENDED: { title: "참석으로 확인됐어요", body: "함께한 분의 피드백으로 참석이 확인돼 노쇼 기록이 지워졌어요." },
  ESCALATED: { title: "이의를 접수했어요", body: "운영자가 확인한 뒤 결과를 알려 드릴게요." },
  NO_SHOW: { title: "노쇼로 기록됐어요", body: "이의 기한까지 응답이 없어 노쇼로 확정됐어요. 다음엔 불참 알림으로 미리 알려 주세요." },
};

export default async function NoshowPage({ params }: PageProps<"/applications/[id]/noshow">) {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const { id } = await params;
  const { data: app } = await supabase.from("applications").select("id").eq("id", id).eq("profile_id", profile.id).maybeSingle();
  if (!app) notFound();
  const { data: c } = await supabase.from("noshow_cases").select("result, objection_deadline_at").eq("application_id", id).maybeSingle();

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="참석 확인" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-6">
        {!c ? (
          <p className="pt-6 text-center text-[14px] text-muted">노쇼 후보 기록이 없어요.</p>
        ) : c.result !== "PENDING" ? (
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-[18px] font-bold">{RESULT[c.result]?.title}</h2>
            <p className="mt-2 text-[13px] text-ink/80">{RESULT[c.result]?.body}</p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-[18px] font-bold leading-snug">체크인 기록이 없어 노쇼 후보로 표시됐어요</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink/80">
                참석하셨다면 {c.objection_deadline_at ? fmt(c.objection_deadline_at) : "기한"}까지 알려 주세요. 함께한 분이 피드백에서 참석을 확인해 주면 자동으로 지워져요.
              </p>
            </section>
            <NoshowForm appId={id} />
          </>
        )}
      </div>
    </main>
  );
}
