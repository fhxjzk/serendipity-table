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
