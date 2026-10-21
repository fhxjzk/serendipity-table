"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "이메일 또는 비밀번호가 맞지 않아요." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
  redirect(profile?.role === "OPERATOR" ? "/admin" : profile ? "/home" : "/signup");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// 시연용 바로 로그인: the test accounts sign in from the server, so judges never type a password.
// Shown only where the SEED_* logins are configured (local and the hackathon deployment).
// In the order of the participant journey: apply, wait, confirmed or failed, then the operator.
const DEMO = {
  new: ["SEED_NEW_EMAIL", "SEED_NEW_PASSWORD"],
  waiting: ["SEED_PARTICIPANT_EMAIL", "SEED_PARTICIPANT_PASSWORD"],
  table: ["SEED_TABLE_EMAIL", "SEED_TABLE_PASSWORD"],
  mate: ["SEED_TABLE2_EMAIL", "SEED_TABLE2_PASSWORD"],
  fail: ["SEED_FAIL_EMAIL", "SEED_FAIL_PASSWORD"],
  admin: ["SEED_OPERATOR_EMAIL", "SEED_OPERATOR_PASSWORD"],
} as const;
export type DemoKind = keyof typeof DEMO;

export async function demoAccounts(): Promise<DemoKind[]> {
  return (Object.keys(DEMO) as DemoKind[]).filter((k) => process.env[DEMO[k][0]] && process.env[DEMO[k][1]]);
}

export async function demoLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const kind = String(formData.get("kind")) as DemoKind;
  const keys = DEMO[kind];
  const email = keys && process.env[keys[0]];
  const password = keys && process.env[keys[1]];
  if (!email || !password) return { error: "이 계정은 지금 쓸 수 없어요." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "테스트 계정으로 로그인하지 못했어요." };
  redirect(kind === "admin" ? "/admin" : "/home");
}
