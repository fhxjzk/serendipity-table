"use client";

import { useActionState } from "react";
import { saveTemplate, sendNow, type ActionState } from "./actions";
import { Result, btnCls, ghostBtnCls, inputCls } from "../ui";

type Template = { code: string; channel: string; title: string | null; body: string };

export function TemplateForm({ t, vars }: { t: Template; vars: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTemplate, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={t.code} />
      {t.channel === "IN_APP" && <input name="title" defaultValue={t.title ?? ""} maxLength={60} aria-label="제목" className={`${inputCls} w-full font-semibold`} />}
      <textarea name="body" defaultValue={t.body} rows={t.body.length > 80 ? 3 : 2} maxLength={1000} aria-label="본문"
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-ink/40" />
      <div className="flex flex-wrap items-center gap-2">
        {vars.length > 0 && <p className="text-[12px] text-muted">변수 {vars.map((v) => `{${v}}`).join(" ")}</p>}
        <button disabled={pending} className={`${ghostBtnCls} ml-auto`}>{pending ? "저장 중…" : "저장"}</button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function SendNowButton() {
  const [state, action, pending] = useActionState<ActionState>(sendNow, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <button disabled={pending} className={btnCls}>{pending ? "보내는 중…" : "대기 중인 메시지 지금 보내기"}</button>
      <Result state={state} />
    </form>
  );
}
