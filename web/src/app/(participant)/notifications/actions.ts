"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Opening a notification marks it read, then goes where it points (internal links only).
export async function openNotification(formData: FormData) {
  const { profile } = await requireProfile("PARTICIPANT");
  const id = String(formData.get("id"));
  const db = createAdminClient();
  await db.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("profile_id", profile.id).is("read_at", null);
  const { data } = await db.from("notifications").select("link").eq("id", id).eq("profile_id", profile.id).maybeSingle();
  const link = data?.link ?? "";
  revalidatePath("/home");
  redirect(link.startsWith("/") && !link.startsWith("//") ? link : "/notifications");
}

export async function markAllRead() {
  const { profile } = await requireProfile("PARTICIPANT");
  await createAdminClient().from("notifications").update({ read_at: new Date().toISOString() })
    .eq("profile_id", profile.id).is("read_at", null);
  revalidatePath("/notifications");
  revalidatePath("/home");
}
