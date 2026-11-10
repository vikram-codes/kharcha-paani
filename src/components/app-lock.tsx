"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Droplet } from "lucide-react";
import { appLockEnabled, unlockApp } from "@/app/actions/emergency";
import { PinPad } from "@/components/pin-pad";

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
        lockIfIdle();
      })
      .catch(() => setState("open")); // offline/signed out: don't trap the screen

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

  // While unlocked, being here counts as activity (first open after unlock, etc.).
  useEffect(() => {
    if (state === "open") writeLast(Date.now());
  }, [state]);

  return (
    <AnimatePresence>
      {state !== "open" && (
        <motion.div
          key="lock"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-6 pt-safe pb-safe"
          role="dialog"
          aria-modal="true"
          aria-label="Kharcha-Paani is locked"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-16 place-items-center rounded-[22px] bg-[#0a0a0a] ring-1 ring-white/10">
              <Droplet className="size-8 fill-lime text-lime" />
            </span>
            {state === "locked" && (
              <>
                <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
                <p className="text-sm text-muted-foreground">Enter your PIN to unlock</p>
              </>
            )}
          </div>
          {state === "locked" && (
            <PinPad
              check={async (pin) => {
                const res = await unlockApp(pin);
                if (res.ok || res.noPin) {
                  writeLast(Date.now());
                  setState("open");
                  return null;
                }
                return res.error;
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
