"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ApplyState = { error?: string };

const MESSAGES: Record<string, string> = {
  RESTRICTED: "지금은 참가가 제한된 상태라 신청할 수 없어요. 자세한 내용은 문의해 주세요.",
  PROFILE_INCOMPLETE: "프로필과 동의를 먼저 완료해 주세요.",
  ALREADY_APPLIED: "이미 진행 중인 신청이 있어요. 홈에서 상태를 확인해 주세요.",
  NO_CHOICE: "날짜와 지역을 각각 1개 이상 골라 주세요.",
  INVALID_CHOICE: "마감됐거나 열리지 않는 날짜·지역이 섞여 있어요. 다시 골라 주세요.",
};

// F-09: dates × regions become the application's choices (only pairs the round offers).
export async function submitApplication(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const roundIds = formData.getAll("rounds").map(String);
  const regions = formData.getAll("regions").map(String);
  if (roundIds.length === 0 || regions.length === 0) return { error: MESSAGES.NO_CHOICE };

  const db = createAdminClient();
  const { data: offered } = await db.from("round_regions").select("round_id, region_code").in("round_id", roundIds).gt("capacity", 0);
  const choices = (offered ?? []).filter((o) => regions.includes(o.region_code) && o.region_code !== "ETC");
  if (choices.length === 0) return { error: "고른 날짜에는 선택한 지역이 열리지 않아요. 다른 지역을 골라 주세요." };

  const { data: appId, error } = await db.rpc("submit_application", { p_profile: profile.id, p_choices: choices });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: code ? MESSAGES[code] : "신청하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  // F-14: how and by when to pay, also in the notification inbox.
  const { data: app } = await db.from("applications").select("payment_due_at").eq("id", appId).single();
  if (app?.payment_due_at) {
    const due = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(app.payment_due_at));
    await db.from("notifications").upsert({
      profile_id: profile.id, type: "PAYMENT_DUE", title: "결제하면 신청이 끝나요",
      body: `${due}까지 이용권으로 결제해 주세요. 기한이 지나면 신청이 자동으로 만료돼요.`,
      link: `/apply/payment?app=${appId}`, dedupe_key: `paydue:${appId}`,
    }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  }
  redirect(`/apply/payment?app=${appId}`);
}
