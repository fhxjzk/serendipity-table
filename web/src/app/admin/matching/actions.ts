"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resetRoundMatching, runRoundMatching } from "@/lib/matching/run";

export type ActionState = { ok?: string; error?: string };

async function audit(actorId: string, action: string, roundId: string, after: unknown) {
  await createAdminClient().from("audit_logs").insert({ actor_id: actorId, action, target_table: "rounds", target_id: roundId, after });
}

// F-76: run the round's matching now, the same code path the scheduler uses.
export async function runNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const roundId = String(formData.get("roundId"));
  try {
    const result = await runRoundMatching(createAdminClient(), roundId, "DEMO");
    await audit(profile.id, "MATCH_RUN_NOW", roundId, result);
    revalidatePath("/admin/matching");
    if (result.alreadyApplied) return { ok: "이미 매칭된 회차라 기존 결과를 유지했어요." };
    const s = result.stats!;
    return { ok: `테이블 ${s.tables}개 확정 · ${s.seated}명 배정 · 실패 ${s.failed}명 · 다른 날짜 대기 ${s.waiting}명` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "매칭 실행에 실패했어요." };
  }
}

// Demo only: undo the round's matching and pause automatic runs for it.
export async function resetRound(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const roundId = String(formData.get("roundId"));
  try {
    await resetRoundMatching(createAdminClient(), roundId);
    await audit(profile.id, "MATCH_RESET", roundId, { auto_match: false });
    revalidatePath("/admin/matching");
    return { ok: "매칭을 되돌렸어요. 이 회차의 자동 실행은 멈췄고, 즉시 실행으로 다시 돌릴 수 있어요." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "되돌리기에 실패했어요." };
  }
}

export async function setAutoMatch(formData: FormData) {
  const { profile } = await requireProfile("OPERATOR");
  const roundId = String(formData.get("roundId"));
  const on = formData.get("on") === "true";
  const db = createAdminClient();
  const { data: round } = await db.from("rounds").select("setting_overrides").eq("id", roundId).single();
  const overrides = { ...(round?.setting_overrides ?? {}), auto_match: on };
  await db.from("rounds").update({ setting_overrides: overrides }).eq("id", roundId);
  await audit(profile.id, on ? "AUTO_MATCH_ON" : "AUTO_MATCH_OFF", roundId, overrides);
  revalidatePath("/admin/matching");
}

// F-76 시점 즉시 실행: send the reminder now, start the event now (check-in and topics), end it now,
// confirm pending no-shows now (demo). Each step is the same database function the scheduler calls.
export async function eventStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile("OPERATOR");
  const roundId = String(formData.get("roundId"));
  const step = String(formData.get("step"));
  const db = createAdminClient();
  try {
    if (step === "remind") {
      const { data, error } = await db.rpc("post_round_reminder", { p_round: roundId });
      if (error) throw error;
      await audit(profile.id, "REMINDER_NOW", roundId, { tables: data });
      revalidatePath("/admin/matching");
      return { ok: `테이블 ${data ?? 0}곳 단체방과 알림함에 전날 리마인드를 보냈어요. 이미 보낸 곳은 다시 보내지 않아요.` };
    }
    if (step === "start") {
      const { data: round } = await db.from("rounds").select("setting_overrides").eq("id", roundId).single();
      await db.from("rounds").update({ setting_overrides: { ...(round?.setting_overrides ?? {}), event_started: true } }).eq("id", roundId);
      const { data, error } = await db.rpc("post_table_contents", { p_round: roundId });
      if (error) throw error;
      await audit(profile.id, "EVENT_START_NOW", roundId, { tables: data });
      revalidatePath("/admin/matching");
      return { ok: data ? `체크인을 열고, 테이블 ${data}곳에 대화 주제 3개와 아이스브레이킹을 올렸어요.` : "체크인이 열려 있고, 모든 테이블에 대화 주제가 이미 올라가 있어요." };
    }
    if (step === "end") {
      const { data, error } = await db.rpc("end_round_event", { p_round: roundId });
      if (error) throw error;
      await audit(profile.id, "EVENT_END_NOW", roundId, data);
      revalidatePath("/admin/matching");
      return { ok: `행사를 종료했어요. 노쇼 후보 ${data?.noshow_candidates ?? 0}명, 피드백 요청을 보냈어요.` };
    }
    if (step === "noshow") {
      const { data, error } = await db.rpc("confirm_noshows", { p_round: roundId, p_force: true });
      if (error) throw error;
      await audit(profile.id, "NOSHOW_CONFIRM_NOW", roundId, { confirmed: data });
      revalidatePath("/admin/matching");
      return { ok: `이의가 없는 노쇼 후보 ${data ?? 0}명을 확정했어요.` };
    }
    return { error: "알 수 없는 작업이에요." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "실행하지 못했어요." };
  }
}
