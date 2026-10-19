import { requireProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export default async function AdminPage() {
  const { profile } = await requireProfile("OPERATOR");
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-xl font-bold">운영자 어드민 · {profile.display_name}</h1>
      <form action={logout} className="mt-6">
        <button className="text-sm text-stone-500 underline">로그아웃</button>
      </form>
    </main>
  );
}
