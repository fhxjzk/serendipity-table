import { requireProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export default async function HomePage() {
  const { profile } = await requireProfile("PARTICIPANT");
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <h1 className="text-xl font-bold">{profile.display_name}님, 안녕하세요</h1>
      <form action={logout} className="mt-6">
        <button className="text-sm text-stone-500 underline">로그아웃</button>
      </form>
    </main>
  );
}
