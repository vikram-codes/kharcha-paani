"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, useAnimationControls } from "motion/react";
import { Check, Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "ok"] as const;

/**
 * PIN dots + keypad (also accepts a hardware keyboard). `check` returns null
 * when the PIN is right, or an error message (the dots shake and clear).
 */
export function PinPad({ check, active = true }: { check: (pin: string) => Promise<string | null>; active?: boolean }) {
  const [pin, setPinState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const shake = useAnimationControls();
  // Mirror of `pin` so fast typing + Enter (before a re-render) sees every digit.
  const pinRef = useRef("");
  const setPin = (next: (p: string) => string) => {
    pinRef.current = next(pinRef.current);
    setPinState(pinRef.current);
  };

  const submit = (value: string) => {
    if (value.length < 4 || checking) return;
    startChecking(async () => {
      const err = await check(value);
      setPin(() => "");
      if (err) {
        setError(err);
        shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } });
        if (navigator.vibrate) navigator.vibrate(60);
      } else setError(null);
    });
  };

  const press = (k: (typeof KEYS)[number]) => {
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    if (k === "ok") return submit(pinRef.current);
    setError(null);
    setPin((p) => (p.length >= 6 ? p : p + k));
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") press("ok");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <motion.div animate={shake} className="flex h-4 items-center gap-3" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            className={cn("size-3 rounded-full transition-colors duration-(--duration-fast)", i < pin.length ? "bg-lime" : "bg-surface-3", error && "bg-budget-over")}
          />
        ))}
      </motion.div>
      <p role="alert" className="-my-2 h-4 text-xs text-budget-over">
        {error}
      </p>
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={checking || (k === "ok" && pin.length < 4)}
            aria-label={k === "⌫" ? "Delete" : k === "ok" ? "Unlock" : k}
            className={cn(
              "num grid h-14 place-items-center rounded-2xl text-xl font-medium transition-transform duration-(--duration-fast) active:scale-95 disabled:opacity-40",
              k === "ok" ? "bg-lime text-on-lime" : "bg-surface-1 active:bg-surface-2",
            )}
          >
            {k === "⌫" ? <Delete className="size-5" /> : k === "ok" ? checking ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
