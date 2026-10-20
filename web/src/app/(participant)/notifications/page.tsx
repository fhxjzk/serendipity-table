// S-11 알림함: 확정·실패·리마인드·대화 주제·피드백·노쇼 알림을 최신순으로 모아 봐요.
import { BellOff, BellRing, CalendarCheck, CircleAlert, Clock, MessageCircle, MessageSquareHeart, UserCheck, type LucideIcon } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/participant-ui";
import { PushToggle } from "@/components/push-toggle";
import { markAllRead, openNotification } from "./actions";

const ICON: Record<string, LucideIcon> = {
  MATCH_CONFIRMED: CalendarCheck,
  MATCH_FAILED: CircleAlert,
  REMINDER: Clock,
  EVENT_START: MessageCircle,
  FEEDBACK_REQUEST: MessageSquareHeart,
  NOSHOW_CHECK: UserCheck,
  NOSHOW_CONFIRMED: CircleAlert,
  PAYMENT_DONE: CalendarCheck,
  REFUND_DONE: CircleAlert,
  VENUE_ASSIGNED: CalendarCheck,
  PUSH_TEST: BellRing,
};

const ago = (iso: string, now: number) => {
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(iso));
};

export default async function NotificationsPage() {
  const { supabase, profile } = await requireProfile("PARTICIPANT");
  const [{ data: items }, { data: setting }] = await Promise.all([
    supabase.from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("notification_settings").select("push_enabled").eq("profile_id", profile.id).maybeSingle(),
  ]);
  const list = items ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  const now = new Date().getTime();

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-paper">
      <PageHeader title="알림" />
      <div className="mx-auto flex w-full max-w-md flex-col px-5 pb-16 pt-4">
        <div className="pb-4"><PushToggle enabled={Boolean(setting?.push_enabled)} /></div>
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-20 text-center text-muted">
            <BellOff className="h-8 w-8" strokeWidth={1.5} />
            <p className="text-[14px]">아직 받은 알림이 없어요.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-3">
              <p className="text-[13px] text-muted">읽지 않은 알림 <span className="font-semibold text-ink tabular">{unread}</span>개</p>
              {unread > 0 && (
                <form action={markAllRead}>
                  <button className="text-[13px] text-ink/70 underline underline-offset-2">모두 읽음</button>
                </form>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {list.map((n) => {
                const Icon = ICON[n.type] ?? MessageCircle;
                return (
                  <li key={n.id}>
                    <form action={openNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className={`flex w-full gap-3 rounded-2xl border p-4 text-left transition hover:border-ink/30 ${n.read_at ? "border-line bg-white/60" : "border-line bg-white shadow-[0_1px_2px_rgba(42,33,27,0.04)]"}`}>
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.read_at ? "bg-sand/60 text-ink/40" : "bg-sand text-ember"}`}>
                          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`text-[14px] font-semibold ${n.read_at ? "text-ink/60" : "text-ink"}`}>{n.title}</span>
                            {!n.read_at && <span aria-label="읽지 않음" className="h-1.5 w-1.5 rounded-full bg-ember" />}
                            <span className="ml-auto shrink-0 text-[11px] text-muted tabular">{ago(n.created_at, now)}</span>
                          </span>
                          <span className={`mt-1 block text-[13px] leading-relaxed ${n.read_at ? "text-ink/50" : "text-ink/75"}`}>{n.body}</span>
                        </span>
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
