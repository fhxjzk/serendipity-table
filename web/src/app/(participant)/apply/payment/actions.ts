"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type PayState = { error?: string };

const MESSAGES: Record<string, string> = {
  PAYMENT_EXPIRED: "결제 기한이 지났어요. 다시 신청해 주세요.",
  TICKET_NOT_USABLE: "이 이용권은 남은 횟수가 없거나 기간이 지나서 쓸 수 없어요.",
  NOT_PAYABLE: "결제할 수 없는 신청이에요. 홈에서 상태를 확인해 주세요.",
  APPLICATION_NOT_FOUND: "신청을 찾을 수 없어요.",
};

// F-13 모의 결제. The DB function locks the application, so a double click pays once.
export async function pay(_prev: PayState, formData: FormData): Promise<PayState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const appId = String(formData.get("app"));
  const option = String(formData.get("option") ?? "");
  if (!option) return { error: "이용권을 골라 주세요." };
  const [kind, ticketId] = option.startsWith("TICKET:") ? ["TICKET", option.slice(7)] : [option, null];

  const db = createAdminClient();
  const { error } = await db.rpc("pay_application", { p_profile: profile.id, p_app: appId, p_option: kind, p_ticket: ticketId });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: code ? MESSAGES[code] : "결제하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  // 결제 완료 알림 (F-39, 이메일 5종 중 하나). A ticket use has no payment row.
  const { data: paid } = await db.from("payments").select("amount").eq("application_id", appId).eq("status", "PAID").order("paid_at", { ascending: false }).limit(1).maybeSingle();
  await db.rpc("notify_template", {
    p_profile: profile.id, p_code: "PAYMENT_DONE", p_vars: { 결제: paid && kind !== "TICKET" ? `${paid.amount.toLocaleString("ko-KR")}원` : "이용권 1회" },
    p_link: "/home", p_dedupe: `paydone:${appId}`,
  });
  redirect(`/apply/payment?app=${appId}`);
}
