"use client";

// F-40 웹 푸시: registers the service worker, asks for permission, and saves the subscription.
// On an iPhone that has not installed the app, push is impossible, so it shows how to install instead.
import { useEffect, useState, useTransition } from "react";
import { BellRing, Share, SquarePlus } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/(participant)/notifications/push-actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function PushToggle({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      if (Notification.permission === "denied") return setState("denied");
      const sub = await reg.pushManager.getSubscription();
      setState(sub && enabled ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [enabled]);

  const turnOn = () => start(async () => {
    setMessage("");
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return setMessage("웹 푸시가 아직 준비되지 않았어요.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "denied" : "off");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
      if (res.error) return setMessage(res.error);
      setState("on");
      setMessage("웹 푸시를 켰어요.");
    } catch {
      setMessage("이 브라우저에서는 구독하지 못했어요.");
    }
  });

  const turnOff = () => start(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    await sub?.unsubscribe();
    await removePushSubscription(sub?.endpoint ?? null);
    setState("off");
    setMessage("웹 푸시를 껐어요. 앱 안 알림은 계속 받아요.");
  });

  const test = () => start(async () => {
    const r = await sendTestPush();
    setMessage(r.sent > 0 ? "테스트 알림을 보냈어요. 잠시 후 도착해요." : "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
  });

  if (state === "loading") return null;
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-ember">
          <BellRing className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">웹 푸시 알림</p>
          {state === "ios-install" ? (
            <p className="mt-1 text-[13px] leading-relaxed text-ink/70">
              아이폰은 홈 화면에 추가한 뒤에 푸시를 받을 수 있어요. Safari 아래쪽 <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="공유" /> 공유 버튼 → <SquarePlus className="inline h-3.5 w-3.5 align-[-2px]" aria-label="추가" /> &lsquo;홈 화면에 추가&rsquo;를 누르고, 추가된 앱에서 다시 켜 주세요.
            </p>
          ) : state === "unsupported" ? (
            <p className="mt-1 text-[13px] leading-relaxed text-ink/70">이 브라우저는 웹 푸시를 지원하지 않아요. 알림은 이 화면에서 계속 확인할 수 있어요.</p>
          ) : state === "denied" ? (
            <p className="mt-1 text-[13px] leading-relaxed text-ink/70">브라우저에서 알림이 차단돼 있어요. 주소창의 사이트 설정에서 알림을 허용하면 켤 수 있어요.</p>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-ink/70">
              {state === "on" ? "식탁 확정·리마인드·대화 주제 안내가 이 기기로 도착해요." : "켜 두면 앱을 닫아도 식탁 확정·리마인드 안내를 바로 받아요."}
            </p>
          )}
          {(state === "on" || state === "off") && (
            <div className="mt-3 flex flex-wrap gap-2">
              {state === "off" ? (
                <button type="button" onClick={turnOn} disabled={pending} className="rounded-xl bg-ink px-3.5 py-2 text-[13px] font-semibold text-cream disabled:opacity-50">웹 푸시 켜기</button>
              ) : (
                <>
                  <button type="button" onClick={test} disabled={pending} className="rounded-xl bg-ink px-3.5 py-2 text-[13px] font-semibold text-cream disabled:opacity-50">테스트 알림 보내기</button>
                  <button type="button" onClick={turnOff} disabled={pending} className="rounded-xl border border-line px-3.5 py-2 text-[13px] text-ink/70 disabled:opacity-50">끄기</button>
                </>
              )}
            </div>
          )}
          {message && <p role="status" className="mt-2 text-[12px] text-muted">{message}</p>}
        </div>
      </div>
    </div>
  );
}
