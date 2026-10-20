"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ChatMessage = { id: string; sender_id: string | null; kind: string; body: string; created_at: string };

const KIND_LABEL: Record<string, string> = { REMINDER: "전날 리마인드", TOPIC: "오늘의 대화 주제", ICEBREAKER: "아이스브레이킹", CURATION: "이 식탁을 고른 이유" };

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
            return (
              <div key={m.id} className="mx-auto max-w-[92%] whitespace-pre-line rounded-2xl bg-sand/80 px-4 py-3 text-[13px] leading-relaxed text-ink/85">
                <p className="mb-1 text-[11px] font-semibold text-ember">{KIND_LABEL[m.kind] ?? "우연한 식탁 안내"}</p>
                {m.body}
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
