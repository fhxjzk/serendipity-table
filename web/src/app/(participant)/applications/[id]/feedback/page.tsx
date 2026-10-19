// S-09 피드백: 만족도·사람별 선호·공개 후기·신고 (F-47~F-49).
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { PageHeader, primaryButton } from "@/components/participant-ui";
import { loadTableForMember } from "@/lib/table-view";
import { FeedbackForm } from "./feedback-form";

export default async function FeedbackPage({ params }: PageProps<"/applications/[id]/feedback">) {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const { id } = await params;
  const t = await loadTableForMember(profile.id, { applicationId: id });
  if (!t) notFound();
  const { data: done } = await supabase.from("feedbacks").select("id").eq("application_id", id).maybeSingle();

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="오늘 저녁 피드백" back={`/applications/${id}/table`} />
      <div className="mx-auto w-full max-w-md px-5 pb-16 pt-5">
        {done ? (
          <div className="flex flex-col gap-5 pt-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" strokeWidth={1.5} />
            <div>
              <h2 className="text-[20px] font-bold tracking-[-0.02em]">고마워요, 잘 받았어요</h2>
              <p className="mt-2 text-[13px] text-muted">다시 만나고 싶은 사람과 피하고 싶은 사람은 다음 매칭에 반영돼요.</p>
            </div>
            <Link href="/rounds" className={primaryButton}>다음 식탁 신청하기</Link>
            <Link href="/home" className="text-[13px] text-muted underline underline-offset-4">홈으로</Link>
          </div>
        ) : !t.eventEnded ? (
          <p className="pt-10 text-center text-[14px] text-muted">피드백은 행사가 끝난 뒤에 남길 수 있어요.</p>
        ) : (
          <FeedbackForm appId={id} mates={t.mates.filter((m) => !m.isMe).map(({ profileId, name, ageBand }) => ({ profileId, name, ageBand }))} />
        )}
      </div>
    </main>
  );
}
