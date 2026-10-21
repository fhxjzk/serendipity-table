"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, CalendarCheck, Info, MessageCircleQuestion, Send, Smile, Sparkles, UserMinus, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ChatMessage = { id: string; sender_id: string | null; kind: string; body: string; created_at: string };

const KIND_LABEL: Record<string, string> = { REMINDER: "전날 리마인드", TOPIC: "오늘의 대화 주제", ICEBREAKER: "아이스브레이킹", CURATION: "이 식탁을 고른 이유", ABSENCE: "불참 알림" };

// Each kind of system note has its own look, so the room reads at a glance.
const STYLE: Record<string, { icon: LucideIcon; box: string; label: string }> = {
  NOTICE: { icon: CalendarCheck, box: "border border-line bg-white border-l-4 border-l-ember", label: "text-ember" },
  CURATION: { icon: Sparkles, box: "bg-gold/15", label: "text-[#7a5a2a]" },
  REMINDER: { icon: BellRing, box: "bg-ember/10", label: "text-ember" },
  TOPIC: { icon: MessageCircleQuestion, box: "border border-line bg-white", label: "text-ember" },
  ICEBREAKER: { icon: Smile, box: "border border-dashed border-gold/60 bg-paper", label: "text-[#7a5a2a]" },
  FOOD: { icon: UtensilsCrossed, box: "bg-sand/80", label: "text-ink/70" },
  ABSENCE: { icon: UserMinus, box: "bg-sand/60", label: "text-ink/60" },
  SYSTEM: { icon: Info, box: "bg-sand/60", label: "text-ink/60" },
};

const time = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// F-42: Realtime inserts appear at once; if the channel drops, reload every 30 seconds.
export function ChatRoom({ roomId, me, names, initial }: { roomId: string; me: string; names: Record<string, string>; initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [supabase] = useState(() => createClient());

  const merge = (incoming: ChatMessage[]) =>
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });

  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, (p) => merge([p.new as ChatMessage]))
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [roomId, supabase]);

  useEffect(() => {
    if (live) return;
    const timer = setInterval(async () => {
      const { data } = await supabase.from("chat_messages").select("id, sender_id, kind, body, created_at").eq("room_id", roomId).order("created_at").limit(200);
      if (data) merge(data);
    }, 30000);
    return () => clearInterval(timer);
  }, [live, roomId, supabase]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setError(null);
    const { data, error: err } = await supabase.from("chat_messages").insert({ room_id: roomId, sender_id: me, kind: "USER", body }).select("id, sender_id, kind, body, created_at").single();
    if (err) { setError("메시지를 보내지 못했어요."); setText(body); return; }
    merge([data]);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-3 px-4 py-4">
        {messages.map((m) => {
          if (m.kind !== "USER") {
            const food = m.body.startsWith("식사 조건 (");
            const style = food ? STYLE.FOOD : STYLE[m.kind] ?? STYLE.SYSTEM;
            const Icon = style.icon;
            // A topic arrives as "Q2. ..." — show the number as a large serif mark.
            const q = m.kind === "TOPIC" ? /^Q(\d+)\.\s*/.exec(m.body) : null;
            const body = food ? m.body.split("\n").slice(1).join("\n") : q ? m.body.slice(q[0].length) : m.body;
            return (
              <div key={m.id} className={`mx-auto max-w-[94%] whitespace-pre-line rounded-2xl px-4 py-3 text-[13px] leading-relaxed text-ink/85 ${style.box}`}>
                <p className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold ${style.label}`}>
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{food ? "식사 조건 · 이름 없이 공유돼요" : KIND_LABEL[m.kind] ?? "우연한 식탁 안내"}</span>
                  <span className="ml-auto font-normal text-muted tabular">{time(m.created_at)}</span>
                </p>
                {q ? (
                  <div className="flex gap-3">
                    <span className="font-serif text-[26px] font-bold leading-none text-ember/80 tabular">{q[1]}</span>
                    <p className="pt-0.5 text-[14px] font-medium text-ink">{body}</p>
                  </div>
                ) : body}
              </div>
            );
          }
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {!mine && <span className="mb-1 px-1 text-[11px] text-muted">{names[m.sender_id ?? ""] ?? "참가자"}</span>}
              <div className="flex items-end gap-1.5">
                {mine && <span className="text-[10px] text-muted tabular">{time(m.created_at)}</span>}
                <p className={`max-w-[75vw] whitespace-pre-line rounded-2xl px-3.5 py-2 text-[14px] sm:max-w-xs ${mine ? "bg-ink text-cream" : "border border-line bg-white"}`}>{m.body}</p>
                {!mine && <span className="text-[10px] text-muted tabular">{time(m.created_at)}</span>}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="sticky bottom-0 border-t border-line bg-paper/95 px-3 pb-5 pt-3 backdrop-blur">
        {error && <p className="mb-2 text-[12px] text-ember">{error}</p>}
        <div className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="메시지 보내기" className="h-11 flex-1 rounded-full border border-line bg-white px-4 text-[14px] outline-none focus:border-ink/40" />
          <button aria-label="보내기" disabled={!text.trim()} className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-cream disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted">{live ? "실시간 연결됨" : "연결 중 · 30초마다 새로 불러와요"}</p>
      </form>
    </div>
  );
}
