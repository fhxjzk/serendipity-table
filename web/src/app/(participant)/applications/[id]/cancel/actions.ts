"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reallocateShrunkTable } from "@/lib/matching/shrink";

export type CancelState = { error?: string; ok?: string };

const MESSAGES: Record<string, string> = {
  USE_ABSENCE: "행사 당일에는 취소 대신 불참 알림만 보낼 수 있어요.",
  USE_CANCEL: "행사 당일이 아니라서 신청 취소로 처리해 주세요.",
  USE_RESOLVE: "매칭 결과 화면에서 이동·보관·환불 중 하나를 골라 주세요.",
  TOO_LATE: "행사가 이미 시작돼 취소하거나 알릴 수 없어요.",
  NOT_CANCELABLE: "지금은 취소할 수 없는 신청이에요.",
  APPLICATION_NOT_FOUND: "신청을 찾지 못했어요.",
};
const message = (m: string) => MESSAGES[Object.keys(MESSAGES).find((k) => m.includes(k)) ?? ""] ?? "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

type Outcome = { already?: boolean; phase?: string; refund?: string; table_id?: string | null; shrink?: { action: string } };

// F-15 cancel (until the day before) and F-16 absence notice (event day). If the table dropped under
// the minimum before the event day, other tables are tried right away (F-33).
export async function cancelOrNotify(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const app = String(formData.get("app"));
  const mode = String(formData.get("mode"));
  const db = createAdminClient();

  const { data, error } = await db.rpc(mode === "absence" ? "notify_absence" : "cancel_application", { p_profile: profile.id, p_app: app });
  if (error) return { error: message(error.message) };
  const out = data as Outcome;

  if (out.shrink?.action === "NEEDS_REALLOC" && out.table_id) {
    try { await reallocateShrunkTable(db, out.table_id); } catch { /* the scheduler sweeps it again within a minute */ }
  }
  // The result text stays on this screen; home and the table pages refresh on their next visit.
  revalidatePath("/home");
  if (out.already) return { ok: "이미 처리된 신청이에요." };
  if (mode === "absence") return { ok: "불참을 알렸어요. 같은 테이블 단체방에도 전달했어요." };
  return {
    ok: out.refund === "REFUNDED" ? "취소했어요. 결제하신 금액이 전액 환불돼요."
      : out.refund === "TICKET_RESTORED" ? "취소했어요. 이용권 1회가 다시 돌아왔어요."
      : "취소했어요.",
  };
}
