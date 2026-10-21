import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "PARTICIPANT" | "OPERATOR";

// Returns the signed-in user's profile, or redirects to /login.
export async function requireProfile(role?: Role) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?reason=no-profile");
  if (role && profile.role !== role) redirect(profile.role === "OPERATOR" ? "/admin" : "/home");
  return { supabase, user, profile };
}
