// Sends queued web pushes and emails (기능 명세서 F-40, F-41, F-45). The database queues one row per
// notification and channel; this takes the due rows, sends them, and reports each result back so the
// database can schedule a retry or pass a repeated failure to the exception inbox.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import nodemailer, { type Transporter } from "nodemailer";
import webpush from "web-push";

type Delivery = { id: string; notification_id: string; channel: "PUSH" | "EMAIL"; attempts: number };
type Note = { id: string; profile_id: string; title: string; body: string; link: string | null };
type Outcome = { result: "SENT" | "SKIPPED" | "FAILED"; error?: string };

const siteUrl = () => (process.env.SITE_URL ?? process.env.VAPID_SUBJECT ?? "").replace(/\/$/, "");

export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
export const emailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

async function sendPush(db: SupabaseClient, n: Note): Promise<Outcome> {
  if (!pushConfigured()) return { result: "SKIPPED", error: "웹 푸시 키가 설정되지 않음" };
  const [{ data: setting }, { data: subs }] = await Promise.all([
    db.from("notification_settings").select("push_enabled").eq("profile_id", n.profile_id).maybeSingle(),
    db.from("push_subscriptions").select("id, endpoint, p256dh, auth_key").eq("profile_id", n.profile_id).is("revoked_at", null),
  ]);
  if (!setting?.push_enabled) return { result: "SKIPPED", error: "참가자가 웹 푸시를 껐음" };
  if (!subs?.length) return { result: "SKIPPED", error: "구독한 기기가 없음" };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const payload = JSON.stringify({ title: n.title, body: n.body, link: n.link ?? "/notifications", tag: n.id });

  let sent = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload, { TTL: 60 * 60 * 24 });
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped this subscription for good.
      if (status === 404 || status === 410) await db.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("id", s.id);
      else errors.push(status ? `HTTP ${status}` : e instanceof Error ? e.message : String(e));
    }
  }
  if (sent > 0) return { result: "SENT" };
  if (errors.length === 0) return { result: "SKIPPED", error: "구독이 만료됨" };
  return { result: "FAILED", error: errors.join(", ").slice(0, 300) };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function emailHtml(n: Pick<Note, "title" | "body" | "link">, base: string) {
  const href = base && n.link ? `${base}${n.link}` : base;
  return `<!doctype html><html lang="ko"><body style="margin:0;background:#f6f1ea;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#2a211b">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 20px;font-size:13px;color:#8a7b6f">우연한 식탁</p>
<div style="background:#fff;border-radius:16px;padding:24px">
<h1 style="margin:0 0 12px;font-size:18px">${escapeHtml(n.title)}</h1>
<p style="margin:0;font-size:14px;line-height:1.7;white-space:pre-line">${escapeHtml(n.body)}</p>
${href ? `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:20px;padding:12px 18px;border-radius:12px;background:#2a211b;color:#fff;text-decoration:none;font-size:14px">앱에서 확인하기</a>` : ""}
</div>
<p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#8a7b6f">신청·결제·매칭에 관한 안내 메일이에요. 광고성 소식은 보내지 않아요. 프로필의 알림 설정에서 종류별로 끌 수 있어요.</p>
</div></body></html>`;
}

let transport: Transporter | null = null;
async function sendEmail(db: SupabaseClient, n: Note): Promise<Outcome> {
  if (!emailConfigured()) return { result: "SKIPPED", error: "이메일 발송 계정(Gmail 앱 비밀번호)이 설정되지 않음" };
  const { data: p } = await db.from("profiles").select("notify_email, origin").eq("id", n.profile_id).maybeSingle();
  if (!p?.notify_email) return { result: "SKIPPED", error: "알림 받을 이메일이 없음" };
  if (p.origin === "BULK") return { result: "SKIPPED", error: "일괄 생성한 테스트 참가자" };
  transport ??= nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  try {
    await transport.sendMail({
      from: { name: "우연한 식탁", address: process.env.GMAIL_USER! },
      to: p.notify_email,
      subject: `[우연한 식탁] ${n.title}`,
      text: `${n.title}\n\n${n.body}${siteUrl() && n.link ? `\n\n${siteUrl()}${n.link}` : ""}`,
      html: emailHtml(n, siteUrl()),
    });
    return { result: "SENT" };
  } catch (e) {
    return { result: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

export async function sendDueDeliveries(db: SupabaseClient, limit = 50) {
  const { data: due, error } = await db.rpc("claim_deliveries", { p_limit: limit });
  if (error) throw new Error(`claim_deliveries: ${error.message}`);
  const rows = (due ?? []) as Delivery[];
  if (!rows.length) return { sent: 0, skipped: 0, retry: 0, failed: 0 };
  const { data: notes } = await db.from("notifications").select("id, profile_id, title, body, link").in("id", [...new Set(rows.map((d) => d.notification_id))]);
  const byId = new Map((notes ?? []).map((n) => [n.id, n as Note]));

  const tally = { sent: 0, skipped: 0, retry: 0, failed: 0 };
  for (const d of rows) {
    const n = byId.get(d.notification_id);
    const out: Outcome = !n ? { result: "SKIPPED", error: "알림이 삭제됨" } : d.channel === "PUSH" ? await sendPush(db, n) : await sendEmail(db, n);
    const { data: state } = await db.rpc("finish_delivery", { p_id: d.id, p_result: out.result, p_error: out.error ?? null });
    if (state === "SENT") tally.sent += 1;
    else if (state === "SKIPPED") tally.skipped += 1;
    else if (state === "RETRY") tally.retry += 1;
    else if (state === "FAILED") tally.failed += 1;
  }
  return tally;
}
