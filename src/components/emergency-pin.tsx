"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, useAnimationControls } from "motion/react";
import { Check, Delete, Loader2, Lock } from "lucide-react";
import { unlockEmergency } from "@/app/actions/emergency";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "ok"] as const;

/**
 * PIN keypad that unlocks the emergency fund. The amount comes back from the
 * server only after the PIN checks out; it isn't in the page before that.
 */
export function EmergencyPinSheet({
  open,
  onOpenChange,
  institution,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institution?: string | null;
  onUnlocked: (cents: number) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const shake = useAnimationControls();

  const submit = (value = pin) => {
    if (value.length < 4 || checking) return;
    startChecking(async () => {
      const res = await unlockEmergency(value);
      if (res.ok) {
        setPin("");
        setError(null);
        onUnlocked(res.cents);
        onOpenChange(false);
      } else {
        setError(res.error);
        setPin("");
        shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } });
      }
    });
  };

  const press = (k: (typeof KEYS)[number]) => {
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    if (k === "ok") return submit();
    setError(null);
    setPin((p) => (p.length >= 6 ? p : p + k));
  };

  // Hardware keyboard on desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") press("ok");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setPin("");
          setError(null);
        }
      }}
    >
      <ResponsiveSheetContent>
        <div className="flex flex-col items-center gap-5 px-6 pt-3 pb-6 md:pt-6">
          <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-lime-ink">
            <Lock className="size-5" />
          </span>
          <div className="text-center">
            <SheetTitle className="text-lg font-semibold">Emergency fund</SheetTitle>
            <SheetDescription className="text-xs">Enter your PIN to show the balance{institution ? ` at ${institution}` : ""}.</SheetDescription>
          </div>

          <motion.div animate={shake} className="flex h-4 items-center gap-3" aria-label={`${pin.length} digits entered`}>
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-3 rounded-full transition-colors duration-(--duration-fast)",
                  i < pin.length ? "bg-lime" : "bg-surface-3",
                  error && "bg-budget-over",
                )}
              />
            ))}
          </motion.div>
          <p role="alert" className="h-4 text-xs text-budget-over">
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
                {k === "⌫" ? (
                  <Delete className="size-5" />
                ) : k === "ok" ? (
                  checking ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />
                ) : (
                  k
                )}
              </button>
            ))}
          </div>
        </div>
      </ResponsiveSheetContent>
    </Sheet>
  );
}
