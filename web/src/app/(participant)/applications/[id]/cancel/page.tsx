// S-12 신청 취소·불참 알림 (F-15, F-16): tell what happens to the money first, then confirm.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, primaryButton } from "@/components/participant-ui";
import { CancelForm } from "./cancel-form";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function CancelPage({ params }: PageProps<"/applications/[id]/cancel">) {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const { id } = await params;
  const { data: app } = await supabase.from("applications")
    .select("id, application_status, payment_status, match_status, attendance_status, ticket_product_code, table_id, is_active, application_choices(round_id, rounds(status, event_date))")
    .eq("id", id).eq("profile_id", profile.id).maybeSingle();
  if (!app) notFound();

  const db = createAdminClient();
  // The round that counts: the table's round once confirmed, otherwise the earliest one still ahead.
  let roundId: string | null = null;
  if (app.table_id) roundId = (await db.from("dining_tables").select("round_id").eq("id", app.table_id).maybeSingle()).data?.round_id ?? null;
  else {
    const choices = (app.application_choices ?? []) as unknown as { round_id: string; rounds: { status: string; event_date: string } | { status: string; event_date: string }[] | null }[];
    roundId = choices.filter((c) => ["OPEN", "CLOSED", "MATCHED"].includes(one(c.rounds)?.status ?? ""))
      .sort((a, b) => (one(a.rounds)!.event_date).localeCompare(one(b.rounds)!.event_date))[0]?.round_id ?? null;
  }
  const phase = roundId ? ((await db.rpc("cancel_phase", { p_round: roundId })).data as string | null) : null;

  const done = app.application_status === "CANCELED" || !app.is_active;
  const resolvable = ["ALTERNATIVE_OFFERED", "EXCEPTION"].includes(app.match_status);
  const paid = app.payment_status === "PAID";
  const sub = (app.ticket_product_code ?? "SINGLE") !== "SINGLE";
  const confirmed = app.match_status === "CONFIRMED";
  const alreadyAbsent = app.attendance_status === "CANCELED_LATE" && !done;

  let content: React.ReactNode;
  if (done) {
    content = <Note title="이미 취소된 신청이에요" body="홈에서 새 일정을 신청할 수 있어요." />;
  } else if (resolvable) {
    content = (
      <>
        <Note title="매칭 결과 화면에서 정리해 주세요" body="이동·이용권 보관·환불 중 하나를 고르면 신청이 정리돼요." />
        <Link href={`/applications/${id}/resolve`} className={primaryButton}>매칭 결과 보기</Link>
      </>
    );
  } else if (alreadyAbsent) {
    content = <Note title="불참을 알려 주셨어요" body="같은 테이블 단체방에도 전달됐어요. 노쇼로 기록되지 않아요." />;
  } else if (phase === "EARLY") {
    content = (
      <>
        <Note
          title="지금 취소하면 환불돼요"
          body={!paid ? "아직 결제 전이라 환불할 금액은 없어요."
            : sub ? "구독 이용권은 환불 대신 1회가 그대로 돌아와요."
            : "결제하신 금액이 전액 환불돼요(모의). 행사 2일 전부터는 환불되지 않아요."}
        />
        {confirmed && <Info>이미 확정된 식탁이에요. 취소하면 이 테이블과 단체방에서 빠지고, 인원이 모자라면 남은 분들을 다른 식탁으로 옮겨요.</Info>}
        <CancelForm appId={id} mode="cancel" label="신청 취소하기" />
      </>
    );
  } else if (phase === "LATE") {
    content = (
      <>
        <Note title="지금 취소하면 환불되지 않아요" body="행사 2일 전부터는 환불할 수 없어요. 대신 패널티는 없어요." />
        {confirmed && <Info>이미 확정된 식탁이에요. 취소하면 이 테이블과 단체방에서 빠지고, 인원이 모자라면 남은 분들을 다른 식탁으로 옮겨요.</Info>}
        <CancelForm appId={id} mode="cancel" label="환불 없이 취소하기" />
      </>
    );
  } else if (phase === "SAME_DAY" && confirmed) {
    content = (
      <>
        <Note title="오늘은 취소 대신 불참을 알려 주세요" body="지금 알려 주시면 노쇼로 기록되지 않아요." />
        <Info>
          환불은 되지 않아요. 같은 테이블 단체방에 바로 알려요. 3개월 안에 2회째 알림부터는 경고가 기록돼요. 단체방에서는 나갈 수 없어요.
        </Info>
        <CancelForm appId={id} mode="absence" label="불참 알리기" />
      </>
    );
  } else {
    content = <Note title="지금은 취소하거나 알릴 수 없어요" body="행사가 이미 시작됐거나 끝났어요. 궁금한 점은 FAQ와 문의로 알려 주세요." />;
  }

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title={phase === "SAME_DAY" ? "불참 알림" : "신청 취소"} />
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-16 pt-6">{content}</div>
    </main>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-[18px] font-bold leading-snug">{title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/80">{body}</p>
    </section>
  );
}

function Info({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-sand/60 px-4 py-3 text-[13px] leading-relaxed text-ink/80">{children}</p>;
}
