"use server";

// F-06 / F-40: web push is switched on and off as a whole, together with the browser permission.
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { sendDueDeliveries } from "@/lib/delivery/send";
import { createAdminClient } from "@/lib/supabase/admin";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function savePushSubscription(sub: Sub, userAgent: string) {
  const { profile } = await requireProfile("PARTICIPANT");
  const { endpoint, keys } = sub ?? {};
  if (!endpoint?.startsWith("https://") || !keys?.p256dh || !keys?.auth) return { error: "구독 정보를 읽지 못했어요." };
  const db = createAdminClient();
  // One browser = one endpoint; signing in with another account on it moves the subscription.
  const { error } = await db.from("push_subscriptions").upsert(
    { profile_id: profile.id, endpoint, p256dh: keys.p256dh, auth_key: keys.auth, user_agent: userAgent.slice(0, 300), revoked_at: null },
    { onConflict: "endpoint" },
  );
  if (error) return { error: "구독을 저장하지 못했어요." };
  await db.from("notification_settings").upsert({ profile_id: profile.id, push_enabled: true, updated_at: new Date().toISOString() }, { onConflict: "profile_id" });
  revalidatePath("/profile");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string | null) {
  const { profile } = await requireProfile("PARTICIPANT");
  const db = createAdminClient();
  if (endpoint) await db.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("endpoint", endpoint).eq("profile_id", profile.id);
  await db.from("notification_settings").upsert({ profile_id: profile.id, push_enabled: false, updated_at: new Date().toISOString() }, { onConflict: "profile_id" });
  revalidatePath("/profile");
  return { ok: true };
}

// A test notification right away, so the participant sees push working without waiting for the scheduler.
export async function sendTestPush() {
  const { profile } = await requireProfile("PARTICIPANT");
  const db = createAdminClient();
  await db.from("notifications").insert({
    profile_id: profile.id, type: "PUSH_TEST", title: "웹 푸시가 켜졌어요",
    body: "식탁 확정·리마인드 같은 안내가 이렇게 도착해요.", link: "/notifications", dedupe_key: `pushtest:${crypto.randomUUID()}`,
  });
  const result = await sendDueDeliveries(db, 10);
  revalidatePath("/notifications");
  return result;
}
