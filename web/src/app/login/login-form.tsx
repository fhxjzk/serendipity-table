"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1 text-sm">
        이메일
        <input name="email" type="email" autoComplete="email" required className="rounded-lg border border-stone-300 px-3 py-2.5 text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        비밀번호
        <input name="password" type="password" autoComplete="current-password" required className="rounded-lg border border-stone-300 px-3 py-2.5 text-base" />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="mt-2 rounded-lg bg-orange-600 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
