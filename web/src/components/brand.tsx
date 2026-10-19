// Brand pieces. The boxed-letter wordmark echoes the 와썹하우스 logo with hairlines;
// everything else stays quiet so photos and real information carry the screen.

type Tone = "light" | "dark";

export function Wordmark({ tone = "dark", size = "md" }: { tone?: Tone; size?: "sm" | "md" }) {
  const color = tone === "light" ? "text-cream border-cream/50" : "text-ink border-ink/40";
  const cell = size === "sm" ? "h-[22px] w-[22px] text-[12px]" : "h-8 w-8 text-[17px]";
  return (
    <span className={`inline-flex ${color}`} aria-label="우연한 식탁">
      {"우연한식탁".split("").map((ch, i) => (
        <span key={i} aria-hidden className={`${cell} ${i > 0 ? "-ml-px" : ""} flex items-center justify-center border font-serif font-bold leading-none`}>
          {ch}
        </span>
      ))}
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
