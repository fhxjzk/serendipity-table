"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login, type LoginState } from "./actions";

const field =
  "h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-ink/40 focus:ring-4 focus:ring-ink/5";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink/80">이메일</span>
        <input name="email" type="email" autoComplete="email" placeholder="name@example.com" required className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink/80">비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" placeholder="비밀번호" required className={field} />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-ember/8 px-3 py-2 text-[13px] text-ember">{state.error}</p>}
      <button
        disabled={pending}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-cream transition hover:bg-espresso disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}
