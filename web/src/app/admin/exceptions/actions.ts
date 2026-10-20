"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { ok?: string; error?: string };

const ERROR_TEXT: Record<string, string> = {
  ALREADY_RESOLVED: "이미 해결된 건이에요.",
  NOT_FOUND: "대상을 찾지 못했어요.",
  VERDICT_REQUIRED: "이의 제기는 '참석 인정'과 '노쇼 유지' 중 하나를 골라 주세요.",
};
const textOf = (message: string) => Object.entries(ERROR_TEXT).find(([k]) => message.includes(k))?.[1] ?? "처리하지 못했어요.";

// F-85: the operator answers an escalated inquiry; the person is notified and the exception closes.
export async function answerInquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("inquiry"));
  const text = String(formData.get("answer") ?? "");
  const db = createAdminClient();
  const { data: before } = await db.from("inquiries").select("status, answer").eq("id", id).maybeSingle();
  const { error } = await db.rpc("answer_inquiry", { p_actor: profile.id, p_inquiry: id, p_text: text });
  if (error) return { error: error.message.includes("ANSWER_REQUIRED") ? "답변 내용을 적어 주세요." : textOf(error.message) };
  await db.from("audit_logs").insert({ actor_id: profile.id, action: "INQUIRY_ANSWER", target_table: "inquiries", target_id: id, before, after: { status: "ANSWERED", answer: text } });
  revalidatePath("/admin/exceptions");
  revalidatePath("/admin");
  return { ok: "답변을 보냈어요. 본인에게 알림이 가요." };
}

// F-66: move an exception to in-progress or resolved, with a note and, for no-show objections, a verdict.
export async function handleException(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const note = String(formData.get("note") ?? "");
  const verdict = String(formData.get("verdict") ?? "") || null;
  const db = createAdminClient();
  const { data: before } = await db.from("exceptions").select("status, resolution_note").eq("id", id).maybeSingle();
  const { error } = await db.rpc("resolve_exception", { p_actor: profile.id, p_exception: id, p_status: status, p_note: note, p_verdict: verdict });
  if (error) return { error: textOf(error.message) };
  await db.from("audit_logs").insert({ actor_id: profile.id, action: status === "RESOLVED" ? "EXCEPTION_RESOLVE" : "EXCEPTION_PROGRESS", target_table: "exceptions", target_id: id, before, after: { status, note, verdict } });
  revalidatePath("/admin/exceptions");
  revalidatePath("/admin");
  return { ok: status === "RESOLVED" ? "해결로 처리했어요." : "처리 중으로 표시했어요." };
}
