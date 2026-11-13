"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Droplet, ScanFace } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { forgetDevice } from "@/lib/forget-device";
import { appLockEnabled, unlockApp } from "@/app/actions/emergency";
import { confirmFaceId, hasFaceIdHere, prepareFaceId, type Prepared } from "@/lib/face-id";
import { PinPad } from "@/components/pin-pad";
import { checkLocalPin, forgetLocalPin, rememberPin } from "@/lib/local-pin";
import { setLockCovered } from "@/lib/app-lock-state";

/** Locks after 5 minutes away or idle (owner, Nov 12 2026; it was 10). */
const IDLE_MS = 5 * 60_000;
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
 * comes back after 5+ minutes away, or after 5 minutes idle on screen.
 * Face ID first when it's set up on this device (Nov 12 2026), the PIN pad
 * as the fallback.
 * Uses the same PIN (and server-side lockout) as the emergency fund.
 * A privacy screen for the phone in your hand, not a replacement for sign-in.
 */
export function AppLock() {
  // "checking" covers the screen on first paint so nothing shows before we know.
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const enabled = useRef<boolean | null>(null);
  const lastTouch = useRef(0);
  // Face ID (when set up on this device): asked for as the lock screen opens; the card retries.
  const [faceHere, setFaceHere] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [faceNote, setFaceNote] = useState<string | null>(null);

  const prepared = useRef<Promise<Prepared> | null>(null);
  const prepare = () => (prepared.current = prepareFaceId());

  const tryFaceId = useCallback(async () => {
    const ready = await (prepared.current ?? prepare());
    if (!ready.ok) {
      prepared.current = null;
      if (ready.why === "gone") setFaceHere(false);
      else setFaceNote(ready.why === "offline" ? "Face ID needs a connection. Use your PIN." : "Face ID didn't work. Use your PIN.");
      return;
    }
    setScanning(true);
    setFaceNote(null);
    const r = await confirmFaceId(ready.options);
    setScanning(false);
    if (r === "ok") {
      prepared.current = null;
      writeLast(Date.now());
      setState("open");
      return;
    }
    // A failed check spends the request; a cancelled prompt doesn't.
    if (r !== "cancelled") {
      prepare();
      setFaceNote(r === "offline" ? "Face ID needs a connection. Use your PIN." : "Face ID didn't work. Try again or use your PIN.");
    }
  }, []);

  useEffect(() => {
    if (state !== "locked") return;
    // Get the Face ID request ready now, so a tap on the card opens Face ID at once.
    const t = setTimeout(() => {
      const here = hasFaceIdHere();
      setFaceHere(here);
      if (here) {
        prepare();
        void tryFaceId(); // iPhone may want a tap first; then the card does it
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state, tryFaceId]);

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
              className="mx-auto flex w-full flex-1 flex-col pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] md:my-auto md:max-h-[820px] md:max-w-md"
            >
              <PinPad
                variant="screen"
                header={
                  <div className="flex flex-col items-center gap-[clamp(12px,2.4dvh,20px)]">
                    <span className="grid size-[clamp(52px,7.5dvh,64px)] place-items-center rounded-[22px] bg-[#0a0a0a] shadow-lg ring-1 ring-white/10">
                      <Droplet className="size-[45%] fill-lime text-lime" />
                    </span>
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
                      <p className="mt-1 text-sm text-muted-foreground">{faceHere ? "Kharcha-Paani is locked" : "Enter your PIN to open Kharcha-Paani"}</p>
                    </div>
                  </div>
                }
                above={
                  faceHere ? (
                    <div className="flex flex-col items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => void tryFaceId()}
                        disabled={scanning}
                        className="flex items-center gap-2 rounded-full bg-surface-1 px-5 py-2.5 text-sm font-medium ring-1 ring-border transition-transform duration-(--duration-fast) active:scale-[0.98]"
                      >
                        <motion.span
                          animate={scanning ? { scale: [1, 1.12, 1], opacity: [1, 0.6, 1] } : { scale: 1, opacity: 1 }}
                          transition={scanning ? { duration: 0.9, repeat: Infinity } : undefined}
                          className="grid place-items-center"
                        >
                          <ScanFace className="size-5 text-lime-ink" />
                        </motion.span>
                        {scanning ? "Scanning…" : "Unlock with Face ID"}
                      </button>
                      <p className="text-xs text-muted-foreground">{faceNote ?? "or enter your PIN"}</p>
                    </div>
                  ) : null
                }
                corner={{
                  label: "Sign out",
                  onClick: () => {
                    forgetDevice();
                    void signOut();
                  },
                }}
                check={async (pin) => {
                  const res = await unlockApp(pin).catch(() => null);
                  if (!res) {
                    // No connection: check against the PIN remembered on this phone.
                    const local = await checkLocalPin(pin);
                    if (local === "ok") {
                      writeLast(Date.now());
                      setState("open");
                      return null;
                    }
                    if (local === "wrong") return "Wrong PIN.";
                    if (local === "too-many") return "Too many tries offline. Connect to the internet to unlock.";
                    return "Can't check your PIN offline yet. Unlock once while connected.";
                  }
                  if (res.ok) void rememberPin(pin);
                  if (res.noPin) forgetLocalPin();
                  if (res.ok || res.noPin) {
                    writeLast(Date.now());
                    setState("open");
                    return null;
                  }
                  return res.error;
                }}
              />
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
