// Brand pieces. The mark is two plates that meet by chance on a table — the overlap, the meeting, is ember.
// Next to it the name is set in the display serif; everything else stays quiet.

type Tone = "light" | "dark";

export function BrandMark({ tone = "dark", size = 24 }: { tone?: Tone; size?: number }) {
  const left = tone === "light" ? "#f6f1ea" : "#2a211b";
  return (
    <svg viewBox="76 124 360 264" width={size * (360 / 264)} height={size} aria-hidden className="shrink-0">
      <defs><clipPath id={`plate-${tone}`}><circle cx="208" cy="256" r="120" /></clipPath></defs>
      <circle cx="304" cy="256" r="120" fill="#c4693d" clipPath={`url(#plate-${tone})`} />
      <circle cx="208" cy="256" r="120" fill="none" stroke={left} strokeWidth="24" />
      <circle cx="304" cy="256" r="120" fill="none" stroke="#c9a46a" strokeWidth="24" />
    </svg>
  );
}

export function Wordmark({ tone = "dark", size = "md" }: { tone?: Tone; size?: "sm" | "md" }) {
  const color = tone === "light" ? "text-cream" : "text-ink";
  return (
    <span className={`inline-flex items-center ${size === "sm" ? "gap-2" : "gap-2.5"} ${color}`} aria-label="우연한 식탁">
      <BrandMark tone={tone} size={size === "sm" ? 20 : 28} />
      <span aria-hidden className={`font-serif font-bold leading-none tracking-[-0.02em] ${size === "sm" ? "text-[17px]" : "text-[22px]"}`}>우연한 식탁</span>
    </span>
  );
}

export function Endorsement({ tone = "dark" }: { tone?: Tone }) {
  return (
    <span className={`text-[10px] font-medium uppercase tracking-[0.28em] ${tone === "light" ? "text-gold" : "text-muted"}`}>
      by Whatsup House
    </span>
  );
}

export function Eyebrow({ children, tone = "dark" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${tone === "light" ? "text-gold" : "text-ember"}`}>{children}</p>
  );
}
