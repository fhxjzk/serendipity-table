// S-28 자동 안내·리마인드 이력 (F-45, F-70, F-71): message templates, and every automatic delivery
// (web push, email, table chat) with its result, attempts and time.
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { emailConfigured, pushConfigured } from "@/lib/delivery/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminHeader, Badge, Empty, cardCls, ghostBtnCls, thCls } from "../ui";
import { retryDelivery } from "./actions";
import { SendNowButton, TemplateForm } from "./forms";

const VENUE_VARS = ["일시", "식당명", "주소", "예약명"];
const TEMPLATES: Record<string, { label: string; when: string; vars: string[] }> = {
  CHAT_CONFIRM_NOTICE: { label: "확정 안내", when: "단체방 · 매칭 확정 직후", vars: VENUE_VARS },
  CHAT_CURATION: { label: "큐레이션", when: "단체방 · 매칭 확정 직후", vars: ["큐레이션"] },
  CHAT_REMINDER: { label: "리마인드", when: "단체방 · 행사 전날 18:00", vars: VENUE_VARS },
  MATCH_CONFIRMED: { label: "매칭 확정", when: "앱 알림·푸시·이메일", vars: VENUE_VARS },
  MATCH_FAILED: { label: "대체 일정 안내", when: "앱 알림·푸시·이메일 · 매칭 실패 직후", vars: [] },
  REMINDER: { label: "행사 1일 전", when: "앱 알림·푸시·이메일 · 전날 18:00", vars: VENUE_VARS },
  PAYMENT_DONE: { label: "결제 완료", when: "앱 알림·푸시·이메일", vars: ["결제"] },
  REFUND_DONE: { label: "환불 완료", when: "앱 알림·푸시·이메일", vars: ["환불"] },
  VENUE_ASSIGNED: { label: "식당 배정(재시도 성공)", when: "앱 알림·푸시", vars: VENUE_VARS },
};
const CHANNEL: Record<string, string> = { PUSH: "웹 푸시", EMAIL: "이메일", CHAT: "단체방" };
const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  SENT: { label: "성공", tone: "green" }, PENDING: { label: "대기·재시도", tone: "amber" }, FAILED: { label: "실패", tone: "red" }, SKIPPED: { label: "건너뜀", tone: "gray" },
};
const time = (iso: string | null) => iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "-";
const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;

type Row = {
  id: string; channel: string; status: string; attempts: number; last_error: string | null; next_retry_at: string | null; sent_at: string | null; created_at: string;
  notifications: { title: string; profiles: { name: string } | { name: string }[] | null } | { title: string; profiles: unknown }[] | null;
  chat_messages: { kind: string; body: string } | { kind: string; body: string }[] | null;
};

export default async function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireProfile("OPERATOR");
  const db = createAdminClient();
  const sp = await searchParams;
  const channel = typeof sp.channel === "string" && CHANNEL[sp.channel] ? sp.channel : "";
  const status = typeof sp.status === "string" && STATUS[sp.status] ? sp.status : "";

  let list = db.from("deliveries")
    .select("id, channel, status, attempts, last_error, next_retry_at, sent_at, created_at, notifications(title, profiles(name)), chat_messages(kind, body)")
    .order("created_at", { ascending: false }).limit(100);
  if (channel) list = list.eq("channel", channel);
  if (status) list = list.eq("status", status);
  const count = (c: string, s: string) => db.from("deliveries").select("id", { count: "exact", head: true }).eq("channel", c).eq("status", s);
  const cells = Object.keys(CHANNEL).flatMap((c) => Object.keys(STATUS).map((s) => [c, s] as const));
  const [{ data: templates }, { data: rows }, ...counts] = await Promise.all([
    db.from("message_templates").select("code, channel, title, body, updated_at"),
    list,
    ...cells.map(([c, s]) => count(c, s)),
  ]);
  const tally = new Map(cells.map(([c, s], i) => [`${c}:${s}`, counts[i].count ?? 0]));
  const ordered = Object.keys(TEMPLATES).map((code) => (templates ?? []).find((t) => t.code === code)).filter((t) => t != null);
  const filterHref = (c: string, s: string) => `/admin/messages${c || s ? `?${new URLSearchParams({ ...(c && { channel: c }), ...(s && { status: s }) })}` : ""}`;

  return (
    <main className="flex flex-col gap-8">
      <AdminHeader crumb="자동 안내" title="자동 안내·발송 이력">
        알림이 생기면 참가자 설정에 따라 웹 푸시·이메일로 자동 발송해요. 실패하면 1분·2분 간격으로 다시 시도하고, 3번 실패하면 예외 처리함으로 넘겨요.
      </AdminHeader>

      <section className="grid gap-3 sm:grid-cols-3">
        {Object.entries(CHANNEL).map(([c, label]) => {
          const ready = c === "PUSH" ? pushConfigured() : c === "EMAIL" ? emailConfigured() : true;
          return (
            <div key={c} className={`${cardCls} p-4`}>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold">{label}</p>
                <Badge tone={ready ? "green" : "amber"}>{ready ? "발송 가능" : "설정 필요"}</Badge>
              </div>
              <p className="mt-2 text-[22px] font-bold tabular">{tally.get(`${c}:SENT`)}<span className="ml-1 text-[13px] font-normal text-muted">건 성공</span></p>
              <p className="mt-1 text-[12px] text-muted tabular">
                대기 {tally.get(`${c}:PENDING`)} · 실패 {tally.get(`${c}:FAILED`)} · 건너뜀 {tally.get(`${c}:SKIPPED`)}
              </p>
              {!ready && <p className="mt-2 text-[12px] leading-relaxed text-amber-800">{c === "EMAIL" ? "Gmail 발송 계정이 없어 이메일은 건너뜀으로 기록돼요." : "VAPID 키가 없어 웹 푸시는 건너뜀으로 기록돼요."}</p>}
            </div>
          );
        })}
      </section>

      <section className={cardCls}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-paper px-4 py-2.5">
          <h2 className="text-[13px] font-bold">발송 이력</h2>
          <div className="flex flex-wrap gap-1.5">
            {[["", "전체"], ...Object.entries(CHANNEL)].map(([c, label]) => (
              <Link key={c} href={filterHref(c, status)} className={`rounded-full border px-2.5 py-1 text-[12px] ${channel === c ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/70"}`}>{label}</Link>
            ))}
            <span className="mx-1 text-line">|</span>
            {[["", "모든 결과"], ...Object.entries(STATUS).map(([s, v]) => [s, v.label])].map(([s, label]) => (
              <Link key={s} href={filterHref(channel, s)} className={`rounded-full border px-2.5 py-1 text-[12px] ${status === s ? "border-ink bg-ink text-cream" : "border-line bg-white text-ink/70"}`}>{label}</Link>
            ))}
          </div>
          <div className="ml-auto"><SendNowButton /></div>
        </div>
        {(rows ?? []).length === 0 ? <Empty>조건에 맞는 발송 기록이 없어요.</Empty> : (
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left text-[12px] text-muted">
              <tr><th className={thCls}>채널</th><th className={thCls}>받는 사람 · 메시지</th><th className={thCls}>결과</th><th className={thCls}>시도</th><th className={thCls}>생성 · 발송</th><th className={thCls}></th></tr>
            </thead>
            <tbody>
              {((rows ?? []) as Row[]).map((d) => {
                const n = one(d.notifications) as { title: string; profiles: unknown } | null;
                const who = n ? (one(n.profiles as { name: string } | { name: string }[] | null)?.name ?? "-") : "테이블 단체방";
                const chat = one(d.chat_messages);
                const s = STATUS[d.status];
                return (
                  <tr key={d.id} className="border-t border-line/70 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5">{CHANNEL[d.channel]}</td>
                    <td className="max-w-[420px] px-4 py-2.5">
                      <span className="font-medium">{who}</span>
                      <p className="mt-0.5 truncate text-[12px] text-muted">{n?.title ?? chat?.body ?? "-"}</p>
                      {d.last_error && <p className="mt-0.5 text-[12px] text-rose-700">{d.last_error}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {d.status === "PENDING" && d.next_retry_at && <p className="mt-1 text-[11px] text-muted">다음 시도 {time(d.next_retry_at)}</p>}
                    </td>
                    <td className="px-4 py-2.5 tabular">{d.attempts}회</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-muted tabular">{time(d.created_at)}<br />{time(d.sent_at)}</td>
                    <td className="px-4 py-2.5">
                      {(d.status === "FAILED" || d.status === "SKIPPED") && d.channel !== "CHAT" && (
                        <form action={retryDelivery}><input type="hidden" name="id" value={d.id} /><button className={`${ghostBtnCls} whitespace-nowrap py-1 text-[12px]`}>다시 보내기</button></form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-bold">메시지 템플릿</h2>
        <p className="mt-1 text-[13px] text-muted">중괄호 안의 변수는 보낼 때 실제 값으로 바뀌어요. 저장하면 다음 발송부터 적용돼요.</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {ordered.map((t) => (
            <div key={t.code} className={`${cardCls} p-4`}>
              <div className="mb-2 flex items-baseline gap-2">
                <p className="text-[14px] font-bold">{TEMPLATES[t.code].label}</p>
                <p className="text-[12px] text-muted">{TEMPLATES[t.code].when}</p>
                <p className="ml-auto text-[11px] text-muted tabular">수정 {time(t.updated_at)}</p>
              </div>
              <TemplateForm t={t} vars={TEMPLATES[t.code].vars} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
