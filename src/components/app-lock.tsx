"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Droplet } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { appLockEnabled, unlockApp } from "@/app/actions/emergency";
import { PinPad } from "@/components/pin-pad";
import { setLockCovered } from "@/lib/app-lock-state";

const IDLE_MS = 10 * 60_000;
const KEY = "kp:last-active";

const readLast = () => {
  try {
    return Number(localStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
};
const writeLast = (t: number) => {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    /* private mode: the lock still works within this session */
  }
};

/** Remembers whether a PIN is set, so the lock still holds when the server can't be reached. */
const LOCK_ON = "kp:lock-on";
const rememberLockOn = (on: boolean) => {
  try {
    localStorage.setItem(LOCK_ON, on ? "1" : "0");
  } catch {
    /* private mode */
  }
};
const lockWasOn = () => {
  try {
    return localStorage.getItem(LOCK_ON) === "1";
  } catch {
    return false;
  }
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/**
 * App lock (owner, Nov 9 2026): asks for the PIN when the app is opened or
 * comes back after 10+ minutes away, or after 10 minutes idle on screen.
 * Uses the same PIN (and server-side lockout) as the emergency fund.
 * A privacy screen for the phone in your hand, not a replacement for sign-in.
 */
export function AppLock() {
  // "checking" covers the screen on first paint so nothing shows before we know.
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const enabled = useRef<boolean | null>(null);
  const lastTouch = useRef(0);

  const lockIfIdle = useCallback(() => {
    if (enabled.current === false) return setState("open");
    const idle = Date.now() - readLast() > IDLE_MS;
    setState((s) => (idle ? "locked" : s === "checking" ? "open" : s));
  }, []);

  useEffect(() => {
    appLockEnabled()
      .then((on) => {
        enabled.current = on;
        rememberLockOn(on);
        lockIfIdle();
      })
      .catch(() => {
        // Offline: stay locked if a PIN was set last time we knew; otherwise don't trap the screen.
        enabled.current = lockWasOn();
        lockIfIdle();
      });

    const touch = () => {
      const now = Date.now();
      if (now - lastTouch.current < 15_000) return; // throttle writes
      lastTouch.current = now;
      if (document.visibilityState === "visible") writeLast(now);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") lockIfIdle();
      else writeLast(Date.now()); // leaving: remember when
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(lockIfIdle, 30_000); // idle on screen
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, [lockIfIdle]);

  useEffect(() => {
    // Animations behind the cover wait for it to lift (and replay after unlock).
    setLockCovered(state !== "open");
    // While unlocked, being here counts as activity (first open after unlock, etc.).
    if (state === "open") writeLast(Date.now());
  }, [state]);

  // Lock screen: no page scrolling behind it.
  useEffect(() => {
    if (state !== "locked") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  return (
    <AnimatePresence>
      {state !== "open" && (
        <motion.div
          key="lock"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Kharcha-Paani is locked"
        >
          {state === "locked" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] md:max-h-[760px] md:my-auto"
            >
              <PinPad
                variant="screen"
                header={
                  <div className="flex flex-col items-center gap-4 text-center">
                    <span className="grid size-[clamp(56px,8.5dvh,72px)] place-items-center rounded-[24px] bg-[#0a0a0a] shadow-lg ring-1 ring-white/10">
                      <Droplet className="size-[45%] fill-lime text-lime" />
                    </span>
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
                      <p className="mt-1 text-sm text-muted-foreground">Enter your PIN to open Kharcha-Paani</p>
                    </div>
                  </div>
                }
                check={async (pin) => {
                  const res = await unlockApp(pin).catch(() => null);
                  if (!res) return "Can't check your PIN offline. Try again when you're connected.";
                  if (res.ok || res.noPin) {
                    writeLast(Date.now());
                    setState("open");
                    return null;
                  }
                  return res.error;
                }}
              />
              <form action={signOut} className="mt-2">
                <button type="submit" className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                  Forgot PIN? Sign out
                </button>
              </form>
            </motion.div>
          )}
          {state === "checking" && (
            <div className="grid flex-1 place-items-center">
              <span className="grid size-[72px] place-items-center rounded-[24px] bg-[#0a0a0a] ring-1 ring-white/10">
                <Droplet className="size-9 fill-lime text-lime" />
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
