"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { discard, drainOutbox, retry, useOutbox } from "@/lib/outbox";
import { cn } from "@/lib/utils";

const subscribeOnline = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

/**
 * Offline quick add (owner, Nov 11 2026): a small pill above the tab bar while
 * you're offline or entries are waiting on this phone. It syncs them when the
 * connection returns, when the app comes back to the front, and every 20s.
 * Also installs the service worker that lets the app open with no signal.
 */
export function SyncStatus() {
  const items = useOutbox();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const waiting = items.filter((i) => !i.error).length;
  const refused = items.length - waiting;

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!online || !waiting) return;
    const sync = () => {
      setSyncing(true);
      drainOutbox()
        .then((n) => n && toast.success(`Synced ${n} ${n === 1 ? "entry" : "entries"} saved offline`))
        .finally(() => setSyncing(false));
    };
    sync();
    const onVisible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(sync, 20_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, [online, waiting]);

  if (online && !items.length) return null;

  const label = !online
    ? waiting
      ? `Offline · ${waiting} to sync`
      : "Offline"
    : refused
      ? `${refused} couldn't sync`
      : `Syncing ${waiting}…`;
  const Icon = !online ? CloudOff : refused ? TriangleAlert : RefreshCw;

  return (
    <>
      <button
        type="button"
        onClick={() => items.length && setOpen(true)}
        className={cn(
          "fixed right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1.5 rounded-full bg-surface-2/95 px-3 py-1.5 text-xs font-medium shadow-lg ring-1 ring-border backdrop-blur md:bottom-6",
          refused && online && "text-budget-high ring-budget-high/50",
        )}
        aria-live="polite"
      >
        <Icon className={cn("size-3.5", online && syncing && !refused && "animate-spin")} />
        {label}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <ResponsiveSheetContent>
          <div className="flex flex-col gap-3 px-5 pt-2 pb-5 md:pt-5">
            <div>
              <SheetTitle className="text-base font-semibold">Saved on this phone</SheetTitle>
              <SheetDescription className="text-xs">
                {online ? "These go to your account as soon as they can." : "You're offline. These sync when you're back online."}
              </SheetDescription>
            </div>
            <div className="divide-y divide-border rounded-2xl bg-surface-1 px-3">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.label}</p>
                    <p className={cn("truncate text-xs", i.error ? "text-budget-over" : "text-muted-foreground")}>
                      {i.error ?? `${formatShort(i.input.date)} · waiting`}
                    </p>
                  </div>
                  <span className={cn("num text-sm", i.kind === "transfer" && "text-transfer")}>
                    {i.cents < 0 ? "−" : "+"}
                    {formatCents(Math.abs(i.cents))}
                  </span>
                  {i.error && online && (
                    <button type="button" onClick={() => retry(i.id)} aria-label={`Try ${i.label} again`} className="grid size-9 place-items-center rounded-full bg-surface-2">
                      <RefreshCw className="size-4" />
                    </button>
                  )}
                  {/* Two taps: the first asks, the second throws it away. */}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirming !== i.id) return setConfirming(i.id);
                      discard(i.id);
                      setConfirming(null);
                      if (items.length === 1) setOpen(false);
                    }}
                    aria-label={confirming === i.id ? `Tap again to discard ${i.label}` : `Discard ${i.label}`}
                    className={cn(
                      "flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium",
                      confirming === i.id ? "bg-budget-over text-white" : "bg-surface-2 text-budget-over",
                    )}
                  >
                    <Trash2 className="size-4" />
                    {confirming === i.id && "Discard"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </>
  );
}
