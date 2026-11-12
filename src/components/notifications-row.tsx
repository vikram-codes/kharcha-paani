"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, ChevronRight, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendTestReminder, setReminder, subscribeDevice, unsubscribeDevice } from "@/app/actions/notifications";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Kind = "bills" | "payday" | "budget" | "catchup" | "applepay";
export type NotificationSettings = {
  configured: boolean;
  publicKey: string | null;
  prefs: Record<Kind, boolean>;
  endpoints: string[];
};

const KINDS: { kind: Kind; label: string; hint: string }[] = [
  { kind: "bills", label: "Bills", hint: "The day before and on the day, 9 am" },
  { kind: "payday", label: "Payday", hint: "Payday morning, 9 am" },
  { kind: "budget", label: "Monthly budget", hint: "At 80% and 100%" },
  { kind: "catchup", label: "Sunday catch-up", hint: "Sundays at 3 pm" },
  { kind: "applepay", label: "Apple Pay purchases", hint: "Amount, place and category after each tap" },
];

/** VAPID public key (base64url) → the bytes pushManager.subscribe wants. */
function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

type Device = "checking" | "unsupported" | "blocked" | "off" | "on";

/**
 * Settings → Notifications (#3, owner, Nov 11 2026): turn reminders on for this
 * device, pick which ones, send a test. On iPhone this works in the app opened
 * from the Home Screen (iOS 16.4+). Reminders never show amounts.
 */
export function NotificationsRow({ settings }: { settings: NotificationSettings }) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<Device>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(settings.prefs);
  const [busy, start] = useTransition();

  // What this device can do, and whether it's already subscribed. Async on
  // purpose: the state updates arrive from the browser's push APIs.
  useEffect(() => {
    let live = true;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return live && setDevice("unsupported");
      if (Notification.permission === "denied") return live && setDevice("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!live) return;
      setEndpoint(sub?.endpoint ?? null);
      setDevice(sub && settings.endpoints.includes(sub.endpoint) ? "on" : "off");
    })().catch(() => live && setDevice("unsupported"));
    return () => {
      live = false;
    };
  }, [settings.endpoints]);

  const turnOn = () =>
    start(async () => {
      if (!settings.publicKey) return;
      // Asked straight from the tap: iPhone only shows the prompt for one.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      try {
        const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(settings.publicKey) }));
        const json = sub.toJSON();
        const res = await subscribeDevice({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          device: /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Mac/.test(navigator.userAgent) ? "Mac" : "Browser",
        });
        if (!res.ok) return void toast.error(res.error);
        setEndpoint(sub.endpoint);
        setDevice("on");
        toast.success("Reminders are on for this device");
      } catch {
        toast.error("Couldn't turn on notifications here.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      await sub?.unsubscribe().catch(() => {});
      if (endpoint) await unsubscribeDevice(endpoint);
      setDevice("off");
      toast.success("Reminders are off for this device");
    });

  const toggle = (kind: Kind, on: boolean) =>
    start(async () => {
      setPrefs((p) => ({ ...p, [kind]: on }));
      const res = await setReminder(kind, on);
      if (!res.ok) {
        setPrefs((p) => ({ ...p, [kind]: !on }));
        toast.error(res.error);
      }
    });

  const test = () =>
    start(async () => {
      const res = await sendTestReminder();
      if (!res.ok) return void toast.error(res.error);
      toast[res.delivered ? "success" : "error"](res.delivered ? "Test sent. Check your notifications." : "No device accepted it. Turn reminders on here first.");
    });

  const subtitle = !settings.configured
    ? "Needs setup in Vercel"
    : device === "on"
      ? "On for this device"
      : "Bills, payday, budget, Sunday catch-up";
  const option = "flex w-full items-center gap-3 rounded-xl bg-surface-1 px-3 py-3 text-left ring-1 ring-border transition-colors duration-(--duration-fast) hover:bg-surface-2 disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
          <Bell className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Notifications</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <ResponsiveSheetContent>
          <div className="flex flex-col gap-4 px-5 pt-2 pb-6 md:pt-5">
            <div>
              <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
              <SheetDescription className="text-xs">Reminders never show amounts. Apple Pay ones show what you just paid.</SheetDescription>
            </div>

            {!settings.configured ? (
              <p className="rounded-xl bg-surface-1 px-3 py-2.5 text-xs text-muted-foreground ring-1 ring-border">
                Not set up yet: the notification keys need to be added in Vercel.
              </p>
            ) : device === "unsupported" ? (
              <p className="rounded-xl bg-surface-1 px-3 py-2.5 text-xs text-muted-foreground ring-1 ring-border">
                Open Kharcha-Paani from your Home Screen to turn notifications on. iPhone only allows them for installed apps.
              </p>
            ) : device === "blocked" ? (
              <p className="rounded-xl bg-surface-1 px-3 py-2.5 text-xs text-muted-foreground ring-1 ring-border">
                Notifications are blocked for this app. Allow them in iPhone Settings → Notifications → Kharcha, then come back.
              </p>
            ) : (
              <button type="button" onClick={device === "on" ? turnOff : turnOn} disabled={busy || device === "checking"} className={option}>
                {device === "on" ? <BellOff className="size-4 text-muted-foreground" /> : <Bell className="size-4 text-muted-foreground" />}
                <span className="flex-1">
                  <span className="block text-sm font-medium">{device === "on" ? "Turn off on this device" : "Turn on for this device"}</span>
                  <span className="block text-xs text-muted-foreground">{device === "on" ? "Reminders are coming here" : "Your phone will ask to allow them"}</span>
                </span>
                {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </button>
            )}

            <div className="divide-y divide-border rounded-xl bg-surface-1 px-3 ring-1 ring-border">
              {KINDS.map(({ kind, label, hint }) => (
                <label key={kind} className="flex cursor-pointer items-center gap-3 py-2.5">
                  <span className="flex-1">
                    <span className="block text-sm">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={prefs[kind]}
                    onChange={(e) => toggle(kind, e.target.checked)}
                    aria-label={label}
                    className={cn(
                      "relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full bg-surface-3 transition-colors duration-(--duration-fast)",
                      "after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-(--duration-fast)",
                      "checked:bg-money-in checked:after:translate-x-4",
                    )}
                  />
                </label>
              ))}
            </div>

            {settings.configured && device === "on" && (
              <button type="button" onClick={test} disabled={busy} className={option}>
                <Send className="size-4 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">Send a test</span>
              </button>
            )}
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </>
  );
}
