"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionState = { ok?: string; error?: string };
const REGIONS = ["HONGDAE", "GANGNAM", "EULJIRO", "JAMSIL"];
const PRICES = ["P10_20", "P20_30", "P30_PLUS"];

// F-59: add a partner venue, or edit one. Every change keeps the before and after values (F-57).
export async function saveVenue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("id") ?? "");
  const row = {
    name: String(formData.get("name") ?? "").trim(),
    region_code: String(formData.get("region_code") ?? ""),
    address: String(formData.get("address") ?? "").trim(),
    price_range: String(formData.get("price_range") ?? "") || null,
    map_url: String(formData.get("map_url") ?? "").trim() || null,
  };
  if (row.name.length < 2 || row.address.length < 4) return { error: "식당 이름과 주소를 적어 주세요." };
  if (!REGIONS.includes(row.region_code)) return { error: "지역을 골라 주세요." };
  if (row.price_range && !PRICES.includes(row.price_range)) return { error: "가격대를 다시 골라 주세요." };
  if (row.map_url && !/^https?:\/\//.test(row.map_url)) return { error: "지도 링크는 http로 시작해야 해요." };
  if (!row.map_url) row.map_url = `https://map.kakao.com/?q=${encodeURIComponent(row.address)}`;

  const db = createAdminClient();
  if (id) {
    const { data: before } = await db.from("venues").select("*").eq("id", id).single();
    const { error } = await db.from("venues").update(row).eq("id", id);
    if (error) return { error: "저장하지 못했어요." };
    await db.from("audit_logs").insert({ actor_id: profile.id, action: "VENUE_UPDATE", target_table: "venues", target_id: id, before, after: row });
  } else {
    const { data, error } = await db.from("venues").insert(row).select("id").single();
    if (error || !data) return { error: "등록하지 못했어요." };
    // New venues are open for every upcoming round right away.
    const { data: rounds } = await db.from("rounds").select("id").eq("status", "OPEN");
    if (rounds?.length) await db.from("venue_availability").insert(rounds.map((r) => ({ venue_id: data.id, round_id: r.id, table_slots: 4, max_seats: 6 })));
    await db.from("audit_logs").insert({ actor_id: profile.id, action: "VENUE_CREATE", target_table: "venues", target_id: data.id, after: row });
  }
  revalidatePath("/admin/venues");
  return { ok: id ? "식당 정보를 고쳤어요." : "식당을 등록했어요. 모집 중인 회차에 테이블 4개씩 열었어요." };
}

export async function toggleVenue(formData: FormData) {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  const db = createAdminClient();
  await db.from("venues").update({ active }).eq("id", id);
  await db.from("audit_logs").insert({ actor_id: profile.id, action: active ? "VENUE_ON" : "VENUE_OFF", target_table: "venues", target_id: id, before: { active: !active }, after: { active } });
  revalidatePath("/admin/venues");
}

// Tables a venue offers for one round. It can't drop below what is already booked.
export async function saveSlots(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const id = String(formData.get("id"));
  const slots = Number(formData.get("table_slots"));
  const seats = Number(formData.get("max_seats"));
  if (!Number.isInteger(slots) || slots < 0 || slots > 50) return { error: "테이블 수는 0~50이에요." };
  if (!Number.isInteger(seats) || seats < 4 || seats > 12) return { error: "최대 인원은 4~12명이에요." };
  const db = createAdminClient();
  const { data: before } = await db.from("venue_availability").select("table_slots, max_seats, booked_slots").eq("id", id).single();
  if (!before) return { error: "재고를 찾지 못했어요." };
  if (slots < before.booked_slots) return { error: `이미 ${before.booked_slots}개가 예약돼 있어 그보다 줄일 수 없어요.` };
  const { error } = await db.from("venue_availability").update({ table_slots: slots, max_seats: seats }).eq("id", id);
  if (error) return { error: "저장하지 못했어요." };
  await db.from("audit_logs").insert({ actor_id: profile.id, action: "VENUE_SLOTS", target_table: "venue_availability", target_id: id, before, after: { table_slots: slots, max_seats: seats } });
  revalidatePath("/admin/venues");
  return { ok: "저장했어요." };
}
