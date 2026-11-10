"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { motion, useAnimationControls } from "motion/react";
import { Check, Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "ok"] as const;
type Key = (typeof KEYS)[number];

/**
 * PIN dots + keypad (also accepts a hardware keyboard). `check` returns null
 * when the PIN is right, or an error message (the dots shake and clear).
 * "sheet": compact, inside a card. "screen": fills the screen, header and dots
 * up top, big round keys down where the thumb is (the app lock).
 */
export function PinPad({
  check,
  variant = "sheet",
  header,
}: {
  check: (pin: string) => Promise<string | null>;
  variant?: "sheet" | "screen";
  header?: ReactNode;
}) {
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
  const screen = variant === "screen";

  const submit = (value: string) => {
    if (value.length < 4 || checking) return;
    startChecking(async () => {
      const err = await check(value);
      setPin(() => "");
      if (err) {
        setError(err);
        shake.start({ x: [0, -12, 12, -7, 7, 0], transition: { duration: 0.4 } });
        if (navigator.vibrate) navigator.vibrate(60);
      } else setError(null);
    });
  };

  const press = (k: Key) => {
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    if (k === "ok") return submit(pinRef.current);
    setError(null);
    setPin((p) => (p.length >= 6 ? p : p + k));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as Key);
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") press("ok");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dots = (
    <motion.div animate={shake} className={cn("flex items-center", screen ? "h-5 gap-4" : "h-4 gap-3")} aria-label={`${pin.length} digits entered`}>
      {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
        <motion.span
          key={i}
          animate={{ scale: i < pin.length ? 1.15 : 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          className={cn(
            "rounded-full transition-colors duration-(--duration-fast)",
            screen ? "size-3.5" : "size-3",
            i < pin.length ? "bg-lime" : screen ? "bg-transparent ring-[1.5px] ring-muted-foreground/50 ring-inset" : "bg-surface-3",
            error && "bg-budget-over ring-0",
          )}
        />
      ))}
    </motion.div>
  );
  const errorLine = (
    <p role="alert" className={cn("h-4 text-xs text-budget-over", !screen && "-my-2")}>
      {error}
    </p>
  );
  const keypad = (
    <div className={cn("grid w-full grid-cols-3", screen ? "max-w-[320px] justify-items-center gap-x-6 gap-y-[clamp(10px,2dvh,16px)]" : "max-w-[280px] gap-2")}>
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          disabled={checking || (k === "ok" && pin.length < 4)}
          aria-label={k === "⌫" ? "Delete" : k === "ok" ? "Unlock" : k}
          className={cn(
            "num grid place-items-center font-medium transition-[transform,background-color,color,opacity] duration-(--duration-fast) active:scale-95",
            screen ? "size-[clamp(60px,9.5dvh,76px)] rounded-full text-[28px]" : "h-14 rounded-2xl text-xl",
            k === "ok"
              ? pin.length >= 4
                ? "bg-lime text-on-lime"
                : "bg-surface-1 text-muted-foreground/60"
              : cn(k === "⌫" && screen ? "text-muted-foreground active:bg-surface-1" : "bg-surface-1 active:bg-surface-2", "disabled:opacity-40"),
          )}
        >
          {k === "⌫" ? <Delete className={screen ? "size-6" : "size-5"} /> : k === "ok" ? checking ? <Loader2 className="size-5 animate-spin" /> : <Check className={screen ? "size-7" : "size-5"} /> : k}
        </button>
      ))}
    </div>
  );

  if (screen) {
    return (
      <div className="flex w-full flex-1 flex-col items-center">
        <div className="flex flex-1 flex-col items-center justify-center gap-[clamp(16px,3.5dvh,28px)] py-4">
          {header}
          <div className="flex flex-col items-center gap-3">
            {dots}
            {errorLine}
          </div>
        </div>
        {keypad}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col items-center gap-5">
      {header}
      {dots}
      {errorLine}
      {keypad}
    </div>
  );
}
