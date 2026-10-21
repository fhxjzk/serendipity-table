"use client";

// One line however many rounds pile up: a dropdown grouped by month, with previous / next round buttons.
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Round = { id: string; title: string; event_date: string; status: string };
const STATUS: Record<string, string> = { OPEN: "모집 중", MATCHED: "매칭 완료", DONE: "종료", CLOSED: "마감", DRAFT: "준비", CANCELED: "취소" };

export function RoundPicker({ rounds, current, basePath }: { rounds: Round[]; current: string; basePath: string }) {
  const router = useRouter();
  const sorted = [...rounds].sort((a, b) => b.event_date.localeCompare(a.event_date)); // newest first
  const i = sorted.findIndex((r) => r.id === current);
  const newer = i > 0 ? sorted[i - 1] : null;
  const older = i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null;
  const go = (id: string) => router.push(`${basePath}?round=${id}`);

  const months = new Map<string, Round[]>();
  for (const r of sorted) {
    const key = `${r.event_date.slice(0, 4)}년 ${Number(r.event_date.slice(5, 7))}월`;
    months.set(key, [...(months.get(key) ?? []), r]);
  }
  const btn = "flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink/80 hover:bg-paper disabled:opacity-35";

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} disabled={!older} onClick={() => older && go(older.id)} aria-label="이전 회차">
        <ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">이전</span>
      </button>
      <select value={current} onChange={(e) => go(e.target.value)} aria-label="회차 선택"
        className="h-9 min-w-[220px] rounded-lg border border-line bg-white px-3 text-[13px] font-medium text-ink outline-none focus:border-ink/40">
        {[...months.entries()].map(([month, list]) => (
          <optgroup key={month} label={month}>
            {list.map((r) => <option key={r.id} value={r.id}>{r.title} · {STATUS[r.status] ?? r.status}</option>)}
          </optgroup>
        ))}
      </select>
      <button type="button" className={btn} disabled={!newer} onClick={() => newer && go(newer.id)} aria-label="다음 회차">
        <span className="hidden sm:inline">다음</span><ChevronRight className="h-4 w-4" />
      </button>
      <span className="hidden text-[12px] text-muted md:inline">전체 {sorted.length}개 회차</span>
    </div>
  );
}
