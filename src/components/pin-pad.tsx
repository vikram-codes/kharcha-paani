"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { motion, useAnimationControls } from "motion/react";
import { Check, Delete, Loader2 } from "lucide-react";
import { pinLength, rememberPinLength } from "@/lib/local-pin";
import { cn } from "@/lib/utils";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
/** After this many wrong auto-submits, the ✓ key comes back (in case the PIN length changed). */
const AUTO_FAILS = 2;

/**
 * PIN dots + keypad (also takes a hardware keyboard). `check` returns null
 * when the PIN is right, or an error message (the dots shake and clear).
 *
 * Lock screen redesign (owner's pick "D", Nov 12 2026): number tiles running
 * almost edge to edge, and no ✓: once this phone has seen the PIN work, it
 * remembers its length (just the length) and submits on the last digit.
 * Until then, or after two wrong auto-submits, the ✓ takes the bottom-left key.
 *
 * "screen": the lock screen (header, `above` e.g. the Face ID card, dots, keypad
 * at the bottom). "sheet": compact, inside a card. `corner`: the bottom-left
 * key when there's no ✓ (e.g. Sign out).
 */
export function PinPad({
  check,
  variant = "sheet",
  header,
  above,
  corner,
}: {
  check: (pin: string) => Promise<string | null>;
  variant?: "sheet" | "screen";
  header?: ReactNode;
  above?: ReactNode;
  corner?: { label: string; onClick: () => void };
}) {
  const [pin, setPinState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [length] = useState(() => (typeof window === "undefined" ? null : pinLength()));
  const [autoFails, setAutoFails] = useState(0);
  const shake = useAnimationControls();
  // Mirror of `pin` so fast typing (before a re-render) sees every digit.
  const pinRef = useRef("");
  const setPin = (next: (p: string) => string) => {
    pinRef.current = next(pinRef.current);
    setPinState(pinRef.current);
  };
  const screen = variant === "screen";
  const auto = length !== null && autoFails < AUTO_FAILS;
  const max = auto ? length : 6;

  const submit = (value: string) => {
    if (value.length < 4 || checking) return;
    startChecking(async () => {
      const err = await check(value);
      setPin(() => "");
      if (err) {
        setError(err);
        if (auto) setAutoFails((n) => n + 1);
        shake.start({ x: [0, -12, 12, -7, 7, 0], transition: { duration: 0.4 } });
        if (navigator.vibrate) navigator.vibrate(60);
      } else {
        setError(null);
        rememberPinLength(value.length);
      }
    });
  };

  const type = (d: string) => {
    if (checking) return;
    setError(null);
    setPin((p) => (p.length >= max ? p : p + d));
    if (auto && pinRef.current.length === length) submit(pinRef.current);
  };
  const del = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) type(e.key);
      else if (e.key === "Backspace") del();
      else if (e.key === "Enter") submit(pinRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dotCount = auto ? length : Math.max(4, pin.length);
  const dots = (
    <motion.div animate={shake} className={cn("flex items-center", screen ? "h-5 gap-4" : "h-4 gap-3")} aria-label={`${pin.length} digits entered`}>
      {Array.from({ length: dotCount }, (_, i) => (
        <motion.span
          key={i}
          animate={{ scale: i < pin.length ? 1.12 : 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          className={cn(
            "rounded-full transition-colors duration-(--duration-fast)",
            screen ? "size-3.5" : "size-3",
            error ? "bg-budget-over" : i < pin.length ? "bg-lime" : "ring-[1.5px] ring-muted-foreground/45 ring-inset",
          )}
        />
      ))}
    </motion.div>
  );
  const status = (
    <p role="alert" className={cn("h-4 text-xs", error ? "text-budget-over" : "text-muted-foreground")}>
      {error ?? (checking ? "Checking…" : "")}
    </p>
  );

  const key = cn(
    "num grid place-items-center rounded-2xl font-medium transition-[transform,background-color,opacity] duration-(--duration-fast) active:scale-[0.97] disabled:opacity-40",
    screen ? "h-[clamp(52px,7.8dvh,72px)] text-[28px]" : "h-14 text-xl",
  );
  const tile = cn(key, "bg-surface-1 active:bg-surface-2");
  const quiet = cn(key, "bg-transparent text-muted-foreground active:bg-surface-1");
  const ready = pin.length >= 4;
  const keypad = (
    <div className={cn("grid w-full grid-cols-3 gap-2", screen ? "px-3" : "max-w-[320px]")}>
      {DIGITS.map((d) => (
        <button key={d} type="button" onClick={() => type(d)} disabled={checking} className={tile}>
          {d}
        </button>
      ))}
      {auto ? (
        corner ? (
          <button type="button" onClick={corner.onClick} className={cn(quiet, "font-sans text-xs font-normal")}>
            {corner.label}
          </button>
        ) : (
          <span />
        )
      ) : (
        <button
          type="button"
          onClick={() => submit(pinRef.current)}
          disabled={checking || !ready}
          aria-label="Unlock"
          className={cn(key, ready ? "bg-lime text-on-lime" : "bg-surface-1 text-muted-foreground/60")}
        >
          {checking ? <Loader2 className="size-5 animate-spin" /> : <Check className={screen ? "size-7" : "size-5"} />}
        </button>
      )}
      <button type="button" onClick={() => type("0")} disabled={checking} className={tile}>
        0
      </button>
      <button type="button" onClick={del} disabled={checking} aria-label="Delete" className={quiet}>
        <Delete className={screen ? "size-6" : "size-5"} />
      </button>
    </div>
  );
  // With the ✓ showing, the corner action moves under the keypad.
  const cornerLink =
    !auto && corner ? (
      <button type="button" onClick={corner.onClick} className="mt-2 self-center px-3 py-1.5 text-xs text-muted-foreground">
        {corner.label}
      </button>
    ) : null;

  if (screen) {
    return (
      <div className="flex w-full flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-[clamp(12px,2.4dvh,20px)] px-6 py-4 text-center">
          {header}
          {above}
          <div className="flex flex-col items-center gap-2.5">
            {dots}
            {status}
          </div>
        </div>
        {keypad}
        {cornerLink}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col items-center gap-4">
      {header}
      {above}
      {dots}
      <div className="-my-1">{status}</div>
      {keypad}
      {cornerLink}
    </div>
  );
}
