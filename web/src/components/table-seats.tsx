// The brand motif: a round table seen from above, with a place card for each guest around it.
// Thin gold lines, a warm wood gradient and a candle glow in the middle; "me" is the ember card.
// With a number instead of names it is a quiet illustration (empty states).

type Seat = { name: string; isMe?: boolean };

export function TableSeats({ seats, size = 200, tone = "light", label }: { seats: Seat[] | number; size?: number; tone?: "light" | "dark"; label?: string }) {
  const list: Seat[] = typeof seats === "number" ? Array.from({ length: seats }, () => ({ name: "" })) : seats;
  const n = Math.max(list.length, 1);
  const dark = tone === "dark";
  const c = 110;
  const tableR = 54;
  const ring = 84;
  const id = dark ? "d" : "l"; // gradient ids per tone (several diagrams can share a page)
  const gold = "#b8955f";
  return (
    <svg viewBox="0 0 220 220" width={size} height={size} role="img" aria-label={label ?? `${n}명이 앉는 원형 식탁`} className="shrink-0">
      <defs>
        <radialGradient id={`wood-${id}`} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor={dark ? "#4a3626" : "#f3ebe0"} />
          <stop offset="100%" stopColor={dark ? "#211812" : "#e2d5c3"} />
        </radialGradient>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0%" stopColor="#f1c27d" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f1c27d" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* soft light the candle throws around the table */}
      <circle cx={c} cy={c} r={tableR + 30} fill={`url(#glow-${id})`} opacity={dark ? 0.35 : 0.25} />
      <circle cx={c} cy={c} r={tableR} fill={`url(#wood-${id})`} stroke={gold} strokeOpacity={dark ? 0.7 : 0.5} strokeWidth="1" />
      <circle cx={c} cy={c} r={tableR - 5} fill="none" stroke={gold} strokeOpacity={0.25} strokeWidth="0.6" />
      {/* place settings: a fine plate outline in front of each seat */}
      {list.map((_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return <circle key={`p${i}`} cx={c + Math.cos(a) * (tableR - 17)} cy={c + Math.sin(a) * (tableR - 17)} r="7.5" fill="none" stroke={gold} strokeOpacity={dark ? 0.45 : 0.4} strokeWidth="0.8" />;
      })}
      {/* candle */}
      <circle cx={c} cy={c} r="16" fill={`url(#glow-${id})`} />
      <circle cx={c} cy={c} r="3.2" fill="#f6d9a3" />
      {/* place cards */}
      {list.map((s, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * ring, y = c + Math.sin(a) * ring;
        const text = s.isMe ? "나" : s.name.length > 2 ? s.name.slice(-2) : s.name;
        const w = s.name ? 44 : 22;
        return (
          <g key={i}>
            <rect x={x - w / 2} y={y - 11} width={w} height="22" rx="11"
              fill={s.isMe ? "#9c4f2c" : dark ? "rgba(246,241,234,0.07)" : "#ffffff"}
              stroke={s.isMe ? "#c47a52" : gold} strokeOpacity={s.isMe ? 1 : dark ? 0.55 : 0.45} strokeWidth="0.9" />
            {text && (
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="600" letterSpacing="0.5"
                fill={s.isMe || dark ? "#f6f1ea" : "#2a211b"}>
                {text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
