"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type EventState = { error?: string; ok?: string };

const MESSAGES: Record<string, string> = {
  TOO_EARLY: "체크인은 행사 시작 30분 전부터 할 수 있어요.",
  EVENT_ENDED: "행사가 끝나서 체크인할 수 없어요.",
  NOT_CONFIRMED: "확정된 식탁이 아니에요.",
  ABSENCE_NOTED: "불참을 알려 주셔서 체크인할 수 없어요.",
  EVENT_NOT_ENDED: "피드백은 행사가 끝난 뒤에 남길 수 있어요.",
  DEADLINE_PASSED: "이의 제기 기한이 지났어요.",
  ALREADY_DECIDED: "이미 처리된 건이에요.",
  NO_CASE: "노쇼 후보 기록이 없어요.",
};
const message = (e: { message: string }) => MESSAGES[Object.keys(MESSAGES).find((k) => e.message.includes(k)) ?? ""] ?? "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

// F-46
export async function checkIn(_prev: EventState, formData: FormData): Promise<EventState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const app = String(formData.get("app"));
  const { error } = await createAdminClient().rpc("check_in", { p_profile: profile.id, p_app: app });
  if (error) return { error: message(error) };
  revalidatePath(`/applications/${app}/table`);
  return { ok: "체크인했어요. 즐거운 저녁 보내세요!" };
}

// F-47~F-49, F-54
export async function submitFeedback(_prev: EventState, formData: FormData): Promise<EventState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const app = String(formData.get("app"));
  const score = (k: string) => Number(formData.get(k));
  const scores = ["mood", "talk", "venue", "rejoin", "recommend"].map(score);
  if (scores.some((s) => !(s >= 1 && s <= 5))) return { error: "다섯 항목 모두 점수를 골라 주세요." };

  const mates = formData.getAll("mate").map(String);
  const pick = (v: string) => mates.filter((m) => formData.get(`pref:${m}`) === v);
  const reportTarget = String(formData.get("reportTarget") ?? "");
  const reviewText = String(formData.get("reviewText") ?? "").trim();
  if (reviewText.length > 100) return { error: "후기는 100자 이내로 적어 주세요." };

  const payload = {
    mood: scores[0], talk: scores[1], venue: scores[2], rejoin: scores[3], recommend: scores[4],
    likes: pick("LIKE"), dislikes: pick("DISLIKE"),
    attended: mates.filter((m) => formData.get(`ate:${m}`) === "on"),
    review_rating: formData.get("reviewRating") ? Number(formData.get("reviewRating")) : "",
    review_text: reviewText, review_public: formData.get("reviewPublic") === "on",
    ...(reportTarget ? { report: { profile: reportTarget, reason: String(formData.get("reportReason") ?? "ETC"), detail: String(formData.get("reportDetail") ?? "").slice(0, 1000) } } : {}),
  };
  const { error } = await createAdminClient().rpc("submit_feedback", { p_profile: profile.id, p_app: app, p: payload });
  if (error) return { error: message(error) };
  redirect(`/applications/${app}/feedback`);
}

// F-55
export async function objectNoshow(_prev: EventState, formData: FormData): Promise<EventState> {
  const { profile } = await requireProfile("PARTICIPANT");
  const app = String(formData.get("app"));
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "참석하셨다는 내용을 간단히 적어 주세요." };
  const { error } = await createAdminClient().rpc("object_noshow", { p_profile: profile.id, p_app: app, p_text: text });
  if (error) return { error: message(error) };
  redirect(`/applications/${app}/noshow`);
}
