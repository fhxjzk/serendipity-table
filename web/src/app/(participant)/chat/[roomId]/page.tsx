// S-08 단체방: 시스템 안내 + 참가자 대화 (F-37, F-38, F-42).
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/participant-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTableForMember } from "@/lib/table-view";
import { ChatRoom, type ChatMessage } from "./chat-room";

export default async function ChatPage({ params }: PageProps<"/chat/[roomId]">) {
  const { profile } = await requireProfile("PARTICIPANT");
  const { roomId } = await params;
  const t = await loadTableForMember(profile.id, { roomId });
  if (!t) notFound();

  const { data: messages } = await createAdminClient()
    .from("chat_messages").select("id, sender_id, kind, body, created_at").eq("room_id", roomId).order("created_at").limit(200);
  const names = Object.fromEntries(t.mates.map((m) => [m.profileId, m.name]));
  const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t.round.start_at));
  const back = t.myApplicationId ? `/applications/${t.myApplicationId}/table` : "/home";

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title={`단체방 · ${t.mates.length}명`} back={back} />
      {/* Who and where, always in view while chatting. */}
      <div className="border-b border-line/70 bg-white/70">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 py-2 text-[12px]">
          <span className="truncate text-ink/80">{when} · {t.venue?.name ?? "식당 안내 예정"}</span>
          <span className="max-w-[45%] truncate text-muted">{t.mates.map((m) => m.name).join(", ")}</span>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <ChatRoom roomId={roomId} me={profile.id} names={names} initial={(messages ?? []) as ChatMessage[]} />
      </div>
    </main>
  );
}
