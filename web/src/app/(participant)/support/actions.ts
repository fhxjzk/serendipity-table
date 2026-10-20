"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type InquiryState = { error?: string; id?: string; code?: string; text?: string };

// F-85: write an inquiry; the rule-based answer comes back at once.
export async function submitInquiry(_prev: InquiryState, formData: FormData): Promise<InquiryState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const category = String(formData.get("category"));
  const body = String(formData.get("body") ?? "");
  if (body.trim().length < 2) return { error: "문의 내용을 적어 주세요." };
  const { data, error } = await createAdminClient().rpc("submit_inquiry", { p_profile: profile.id, p_category: category, p_body: body });
  if (error) return { error: "문의를 보내지 못했어요. 잠시 후 다시 시도해 주세요." };
  const out = data as { id: string; code: string; text: string };
  return { id: out.id, code: out.code, text: out.text };
}

// "해결됐어요" closes it as auto-resolved; "운영자에게 보내기" puts it in the operator's exception inbox.
export async function closeInquiry(_prev: { status?: string; error?: string }, formData: FormData): Promise<{ status?: string; error?: string }> {
  const { profile } = await requireProfile("PARTICIPANT");
  const { data, error } = await createAdminClient().rpc("close_inquiry", {
    p_profile: profile.id, p_inquiry: String(formData.get("id")), p_resolved: formData.get("resolved") === "yes",
  });
  if (error) return { error: "처리하지 못했어요. 잠시 후 다시 시도해 주세요." };
  revalidatePath("/support");
  return { status: data as string };
}
