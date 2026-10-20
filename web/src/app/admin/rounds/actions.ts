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

// F-58 수정: title, start and end time, and each region's capacity of a round still taking applications.
// The date and the region list stay as they are (people may already have chosen them).
export async function updateRound(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("id"));
  const db = createAdminClient();
  const { data: before } = await db.from("rounds").select("title, event_date, start_at, end_at, status, round_regions(region_code, capacity)").eq("id", id).single();
  if (!before) return { error: "회차를 찾지 못했어요." };
  if (!["DRAFT", "OPEN"].includes(before.status)) return { error: "매칭이 끝난 회차는 고칠 수 없어요." };
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) return { error: "종료 시각은 시작 시각보다 늦어야 해요." };
  const title = String(formData.get("title") ?? "").trim() || before.title;
  const startAt = new Date(`${before.event_date}T${start}:00+09:00`).toISOString();
  const endAt = new Date(`${before.event_date}T${end}:00+09:00`).toISOString();
  const { error } = await db.from("rounds").update({ title, start_at: startAt, end_at: endAt }).eq("id", id);
  if (error) return { error: "저장하지 못했어요." };
  const capacities: Record<string, number> = {};
  for (const r of (before.round_regions ?? []) as { region_code: string; capacity: number }[]) {
    const v = Number(formData.get(`capacity_${r.region_code}`));
    if (Number.isInteger(v) && v >= 0 && v <= 1000 && v !== r.capacity) {
      await db.from("round_regions").update({ capacity: v }).eq("round_id", id).eq("region_code", r.region_code);
      capacities[r.region_code] = v;
    }
  }
  await db.from("audit_logs").insert({ actor_id: profile.id, action: "ROUND_UPDATE", target_table: "rounds", target_id: id, before, after: { title, start_at: startAt, end_at: endAt, capacities } });
  revalidatePath("/admin/rounds");
  revalidatePath("/admin/matching");
  return { ok: "회차를 고쳤어요." };
}

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
