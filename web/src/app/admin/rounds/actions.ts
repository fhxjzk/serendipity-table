"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { ok?: string; error?: string };

const ERROR_TEXT: Record<string, string> = {
  DATE_REQUIRED: "행사 날짜를 골라 주세요.",
  TIME_ORDER: "종료 시각은 시작 시각보다 늦어야 해요.",
  DEADLINE_PASSED: "신청 마감(행사 3일 전 18시)이 이미 지난 날짜예요. 더 늦은 날짜를 골라 주세요.",
  DUPLICATE_DATE: "그 날짜에는 이미 회차가 있어요.",
  REGION_REQUIRED: "지역을 한 곳 이상 골라 주세요.",
};

// F-58: create a round. The database applies the standing schedule rules and seeds venue slots.
export async function createRound(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const regions = formData.getAll("region").map((code) => ({
    code: String(code),
    capacity: Number(formData.get(`capacity_${code}`)) || 60,
  }));
  const payload = {
    event_date: String(formData.get("event_date") ?? ""),
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    table_slots: Number(formData.get("table_slots")) || 4,
    regions,
  };
  const db = createAdminClient();
  const { data, error } = await db.rpc("create_round", { p_actor: profile.id, p: payload });
  if (error) {
    const key = Object.keys(ERROR_TEXT).find((k) => error.message.includes(k));
    return { error: key ? ERROR_TEXT[key] : "회차를 만들지 못했어요." };
  }
  await db.from("audit_logs").insert({ actor_id: profile.id, action: "ROUND_CREATE", target_table: "rounds", target_id: data, after: payload });
  revalidatePath("/admin/rounds");
  revalidatePath("/admin/matching");
  return { ok: "회차를 만들었어요. 신청 마감 시각이 지나면 자동으로 매칭돼요." };
}
