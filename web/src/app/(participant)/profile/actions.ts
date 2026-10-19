"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateProfile, type FieldErrors } from "@/lib/profile-validation";

export type ProfileState = { errors?: FieldErrors; error?: string; saved?: boolean };

const EMAIL_KINDS = ["email_payment_done", "email_match_confirmed", "email_match_failed", "email_reminder", "email_refund_done"] as const;

// S-02 save. Only these fields are written; role and restriction stay server-owned.
export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const str = (k: string) => String(formData.get(k) ?? "");
  const all = (k: string) => formData.getAll(k).map(String);

  const { errors, value } = validateProfile({
    name: str("name"), phone: str("phone"), birthYear: str("birthYear"), gender: str("gender"), job: str("job"),
    mbti: str("mbti") || "UNKNOWN", interests: all("interests"), selfTraits: all("selfTraits"), wantedTraits: all("wantedTraits"),
    priceRanges: all("priceRanges"), foodAvoid: str("foodAvoid"), allergies: str("allergies"), oneLiner: str("oneLiner"),
    notifyEmail: str("notifyEmail"), agreePrivacy: formData.get("agreePrivacy") === "on", agreePolicy: formData.get("agreePolicy") === "on",
  });
  if (!value) return { errors };

  const db = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await db.from("profiles").update({
    ...value,
    display_name: value.name,
    privacy_agreed_at: profile.privacy_agreed_at ?? now,
    policy_agreed_at: profile.policy_agreed_at ?? now,
    updated_at: now,
  }).eq("id", profile.id);
  if (error) return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };

  await db.from("notification_settings").upsert({
    profile_id: profile.id,
    ...Object.fromEntries(EMAIL_KINDS.map((k) => [k, formData.get(k) === "on"])),
    updated_at: now,
  });

  const next = str("next");
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
  return { saved: true };
}
