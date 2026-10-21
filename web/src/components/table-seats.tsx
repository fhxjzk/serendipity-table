// The brand motif: a round table seen from above, one seat per person around it.
// Seats show the first letter of each name; "me" is marked in ember. With no names it is a quiet illustration.

type Seat = { name: string; isMe?: boolean };

export function TableSeats({ seats, size = 200, tone = "light", label }: { seats: Seat[] | number; size?: number; tone?: "light" | "dark"; label?: string }) {
  const list: Seat[] = typeof seats === "number" ? Array.from({ length: seats }, () => ({ name: "" })) : seats;
  const n = Math.max(list.length, 1);
  const c = 100;
  const tableR = 46;
  const seatR = 15;
  const ring = 76;
  const dark = tone === "dark";
  const plate = dark ? "rgba(246,241,234,0.14)" : "rgba(42,33,27,0.07)";
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label ?? `${n}명이 앉는 원형 식탁`} className="shrink-0">
      {/* table */}
      <circle cx={c} cy={c} r={tableR} fill={dark ? "#2b211a" : "#efe7dc"} stroke={dark ? "rgba(184,149,95,0.55)" : "#e6ddd0"} strokeWidth="1.5" />
      <circle cx={c} cy={c} r={tableR - 7} fill="none" stroke={dark ? "rgba(184,149,95,0.25)" : "rgba(156,79,44,0.12)"} strokeWidth="1" strokeDasharray="2 4" />
      {/* candle in the middle */}
      <circle cx={c} cy={c} r="5" fill="#b8955f" opacity={dark ? 0.9 : 0.75} />
      <circle cx={c} cy={c} r="11" fill="#b8955f" opacity="0.12" />
      {list.map((s, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const sx = c + Math.cos(a) * ring, sy = c + Math.sin(a) * ring;
        const px = c + Math.cos(a) * (tableR - 16), py = c + Math.sin(a) * (tableR - 16);
        const fill = s.isMe ? "#9c4f2c" : dark ? "#f6f1ea" : "#ffffff";
        const text = s.isMe ? "#f6f1ea" : "#2a211b";
        return (
          <g key={i}>
            <circle cx={px} cy={py} r="7" fill={plate} />
            <circle cx={sx} cy={sy} r={seatR} fill={fill} stroke={s.isMe ? "#9c4f2c" : dark ? "rgba(246,241,234,0.4)" : "#e6ddd0"} strokeWidth="1.5" />
            {s.name && (
              // Given name (two letters) so people who share a family name stay apart.
              <text x={sx} y={sy} textAnchor="middle" dominantBaseline="central" fontSize={s.isMe ? 12 : 9.5} fontWeight="700" fill={text}>
                {s.isMe ? "나" : s.name.length > 2 ? s.name.slice(-2) : s.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
