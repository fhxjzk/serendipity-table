// Shared pieces for the operator console pages.
export function AdminHeader({ crumb, title, children }: { crumb: string; title: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-muted">운영 · {crumb}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em]">{title}</h1>
      {children && <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export const cardCls = "overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(42,33,27,0.04)]";
export const thCls = "px-4 py-2.5 font-medium";
export const inputCls = "h-9 rounded-lg border border-line bg-white px-3 text-[13px] text-ink outline-none focus:border-ink/40";
export const btnCls = "rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-cream hover:bg-espresso disabled:opacity-40";
export const ghostBtnCls = "rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] text-ink hover:bg-paper disabled:opacity-40";

const TONE: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  gray: "bg-stone-100 text-stone-600 ring-stone-200",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${TONE[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-[13px] text-muted">{children}</p>;
}

export function Result({ state }: { state: { ok?: string; error?: string } }) {
  if (state.error) return <p className="text-xs text-red-600">{state.error}</p>;
  if (state.ok) return <p className="text-xs text-[#4f6b3a]">{state.ok}</p>;
  return null;
}
