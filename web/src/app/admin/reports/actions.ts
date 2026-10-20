"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { ok?: string; error?: string };

const ERROR_TEXT: Record<string, string> = {
  ALREADY_RESOLVED: "이미 처리된 신고예요.",
  ALREADY_DECIDED: "이미 결정된 제재예요.",
  NOT_FOUND: "대상을 찾지 못했어요.",
};
const textOf = (message: string) => Object.entries(ERROR_TEXT).find(([k]) => message.includes(k))?.[1] ?? "처리하지 못했어요.";
const untilOf = (formData: FormData) => String(formData.get("until") ?? "") || null;

// F-68: take a report, or close it with no action, a warning, a restriction or a ban.
export async function reviewReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("id"));
  const action = String(formData.get("action"));
  const db = createAdminClient();
  const { data: before } = await db.from("reports").select("status").eq("id", id).maybeSingle();
  const { error } = await db.rpc("review_report", { p_actor: profile.id, p_report: id, p_action: action, p_until: untilOf(formData) });
  if (error) return { error: textOf(error.message) };
  await db.from("audit_logs").insert({ actor_id: profile.id, action: "REPORT_REVIEW", target_table: "reports", target_id: id, before, after: { action } });
  revalidatePath("/admin/reports");
  return { ok: action === "REVIEWING" ? "검토 중으로 표시했어요." : "신고를 처리했어요." };
}

// F-86: hide an inappropriate public review, or show it again.
export async function toggleReviewHidden(formData: FormData) {
  const { profile } = await requireProfile("OPERATOR");
  const app = String(formData.get("app"));
  const hidden = formData.get("hidden") === "true";
  const db = createAdminClient();
  await db.from("feedbacks").update({ review_hidden: hidden }).eq("application_id", app);
  await db.from("audit_logs").insert({ actor_id: profile.id, action: hidden ? "REVIEW_HIDE" : "REVIEW_SHOW", target_table: "feedbacks", target_id: app, before: { review_hidden: !hidden }, after: { review_hidden: hidden } });
  revalidatePath("/admin/reports");
  revalidatePath("/reviews");
  revalidatePath("/home");
}

// F-68: confirm or reject a proposed sanction (such as the restriction after a second no-show).
export async function decideSanction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const db = createAdminClient();
  const { data: before } = await db.from("sanctions").select("status, until_date").eq("id", id).maybeSingle();
  const { error } = await db.rpc("decide_sanction", { p_actor: profile.id, p_sanction: id, p_decision: decision, p_until: untilOf(formData) });
  if (error) return { error: textOf(error.message) };
  await db.from("audit_logs").insert({ actor_id: profile.id, action: "SANCTION_DECIDE", target_table: "sanctions", target_id: id, before, after: { decision, until: untilOf(formData) } });
  revalidatePath("/admin/reports");
  return { ok: decision === "CONFIRM" ? "제재를 확정했어요. 본인에게 알림이 가요." : "제안을 반려했어요." };
}
