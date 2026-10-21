"use client";

// A server or network hiccup: one calm message and a retry, never a raw stack trace.
import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <h1 className="text-[20px] font-bold tracking-[-0.02em]">잠시 문제가 생겼어요</h1>
      <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-muted">일시적인 오류일 수 있어요. 다시 시도해도 같으면 잠시 후에 열어 주세요.</p>
      {error.digest && <p className="mt-2 text-[11px] text-muted tabular">오류 코드 {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <button onClick={reset} className="flex h-11 items-center rounded-xl bg-ink px-5 text-[14px] font-semibold text-cream">다시 시도</button>
        <Link href="/" className="flex h-11 items-center rounded-xl border border-line bg-white px-5 text-[14px]">처음 화면으로</Link>
      </div>
    </main>
  );
}
