// Brand pieces. The mark is two plates set diagonally across a table, meeting by chance — the overlap, the meeting, is ember.
// Next to it the name is set in the display serif; everything else stays quiet.

type Tone = "light" | "dark";

export function BrandMark({ tone = "dark", size = 24 }: { tone?: Tone; size?: number }) {
  const left = tone === "light" ? "#f6f1ea" : "#2a211b";
  return (
    <svg viewBox="88 88 336 336" width={size} height={size} aria-hidden className="shrink-0">
      <defs><clipPath id={`plate-${tone}`}><circle cx="214" cy="214" r="112" /></clipPath></defs>
      <circle cx="298" cy="298" r="112" fill="#c4693d" clipPath={`url(#plate-${tone})`} />
      <circle cx="214" cy="214" r="112" fill="none" stroke={left} strokeWidth="24" />
      <circle cx="298" cy="298" r="112" fill="none" stroke="#c9a46a" strokeWidth="24" />
    </svg>
  );
}

export function Wordmark({ tone = "dark", size = "md" }: { tone?: Tone; size?: "sm" | "md" }) {
  const color = tone === "light" ? "text-cream" : "text-ink";
  return (
    <span className={`inline-flex items-center ${size === "sm" ? "gap-2" : "gap-2.5"} ${color}`} aria-label="우연한 식탁">
      <BrandMark tone={tone} size={size === "sm" ? 24 : 32} />
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
