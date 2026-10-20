"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { sendDueDeliveries } from "@/lib/delivery/send";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { ok?: string; error?: string };

const TEMPLATE_ERRORS: Record<string, string> = {
  EMPTY_BODY: "본문을 비울 수 없어요.",
  EMPTY_TITLE: "앱 알림은 제목이 필요해요.",
  NOT_FOUND: "템플릿을 찾지 못했어요.",
};

// F-70: edit a template; the before and after text are kept in the change log (F-57).
export async function saveTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const code = String(formData.get("code") ?? "");
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  if (body.length > 1000 || title.length > 60) return { error: "제목은 60자, 본문은 1000자 안으로 적어 주세요." };
  const { error } = await createAdminClient().rpc("update_message_template", { p_actor: profile.id, p_code: code, p_title: title, p_body: body });
  if (error) {
    const key = Object.keys(TEMPLATE_ERRORS).find((k) => error.message.includes(k));
    return { error: key ? TEMPLATE_ERRORS[key] : "저장하지 못했어요." };
  }
  revalidatePath("/admin/messages");
  return { ok: "저장했어요. 다음 발송부터 이 문구가 쓰여요." };
}

// F-45: try a failed or skipped delivery again, right now.
export async function retryDelivery(formData: FormData) {
  const { profile } = await requireProfile("OPERATOR");
  const db = createAdminClient();
  const { error } = await db.rpc("retry_delivery", { p_actor: profile.id, p_id: String(formData.get("id")) });
  if (!error) await sendDueDeliveries(db, 10);
  revalidatePath("/admin/messages");
}

// Sends whatever is due without waiting for the next scheduler minute.
export async function sendNow(_prev: ActionState): Promise<ActionState> {
  await requireProfile("OPERATOR");
  const r = await sendDueDeliveries(createAdminClient());
  revalidatePath("/admin/messages");
  const total = r.sent + r.skipped + r.retry + r.failed;
  if (!total) return { ok: "보낼 메시지가 없어요." };
  return { ok: `발송 ${r.sent}건 · 건너뜀 ${r.skipped}건 · 재시도 예정 ${r.retry}건 · 실패 ${r.failed}건` };
}
