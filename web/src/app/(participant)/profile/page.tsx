// S-02 프로필·매칭 선호 작성
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/participant-ui";
import { ProfileForm, type ProfileFormData } from "./profile-form";

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const { next } = await searchParams;
  const [{ data: codeRows }, { data: settings }] = await Promise.all([
    supabase.from("code_values").select("code_group, code, label").eq("active", true).order("sort_order"),
    supabase.from("notification_settings").select("*").eq("profile_id", profile.id).maybeSingle(),
  ]);
  const group = (g: string) => (codeRows ?? []).filter((c) => c.code_group === g).map(({ code, label }) => ({ code, label }));
  const codes: ProfileFormData["codes"] = {
    INTEREST: group("INTEREST"), SELF_TRAIT: group("SELF_TRAIT"), WANTED_TRAIT: group("WANTED_TRAIT"), PRICE_RANGE: group("PRICE_RANGE"),
  };

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="내 프로필" step={next ? "1 / 3" : undefined} />
      <div className="mx-auto w-full max-w-md px-5 pb-16 pt-5">
        {next && <p className="mb-4 text-[13px] leading-relaxed text-muted">신청 전에 프로필을 확인해 주세요. 한 번 저장하면 다음 신청에도 그대로 쓰여요.</p>}
        <ProfileForm profile={profile} codes={codes} emails={settings ?? {}} next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
