"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResolveState = { error?: string };

const MESSAGES: Record<string, string> = {
  NOT_RESOLVABLE: "이미 처리됐거나 선택할 수 없는 상태예요. 홈에서 확인해 주세요.",
  OFFER_NOT_AVAILABLE: "그 일정은 마감돼서 옮길 수 없어요. 다른 일정을 골라 주세요.",
  NO_TICKET: "보관할 이용권이 없어요. 환불을 골라 주세요.",
  PAYMENT_NOT_FOUND: "결제 기록을 찾지 못했어요. 문의해 주세요.",
};

// S-06: 일정 이동(F-19) · 이용권 보관(F-20) · 환불(F-21).
export async function resolveFailure(_prev: ResolveState, formData: FormData): Promise<ResolveState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const appId = String(formData.get("app"));
  const choice = String(formData.get("choice") ?? "");
  if (!["MOVE", "KEEP", "REFUND"].includes(choice)) return { error: "처리 방법을 골라 주세요." };
  const [round, region] = String(formData.get("offer") ?? "").split("|");
  if (choice === "MOVE" && (!round || !region)) return { error: "옮길 일정을 골라 주세요." };

  const { error } = await createAdminClient().rpc("resolve_match_failure", {
    p_profile: profile.id, p_app: appId, p_choice: choice,
    p_round: choice === "MOVE" ? round : null, p_region: choice === "MOVE" ? region : null,
  });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { error: code ? MESSAGES[code] : "처리하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  redirect(`/applications/${appId}/resolve`);
}
