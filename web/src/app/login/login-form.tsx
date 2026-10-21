"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login, type LoginState } from "./actions";

const field =
  "h-11 w-full rounded-xl border border-cream/15 bg-cream/[0.06] px-4 text-[15px] text-cream outline-none transition placeholder:text-cream/35 focus:border-gold/60 focus:ring-4 focus:ring-gold/10";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-cream/75">이메일</span>
        <input name="email" type="email" autoComplete="email" placeholder="name@example.com" required className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-cream/75">비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" placeholder="비밀번호" required className={field} />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-ember/25 px-3 py-2 text-[13px] text-[#f3c4ab]">{state.error}</p>}
      <button
        disabled={pending}
        className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-gold text-[15px] font-semibold text-espresso transition hover:bg-[#c9a66d] disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}
