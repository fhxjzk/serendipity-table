import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
      <div>
        <h1 className="text-2xl font-bold">우연한 식탁</h1>
        <p className="mt-1 text-stone-600">처음 만나는 사람들과 한 끼 식사</p>
      </div>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
