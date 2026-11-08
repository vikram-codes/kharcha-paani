"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changePin } from "@/app/actions/emergency";

const field =
  "num h-11 w-full rounded-xl bg-surface-2 px-3 text-base tracking-[0.3em] ring-1 ring-border outline-none placeholder:tracking-normal placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-lime";

/** Settings → change the emergency fund PIN (4–6 digits). */
export function ChangePinForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError("The new PINs don't match.");
    startSaving(async () => {
      const res = await changePin(current, next);
      if (!res.ok) return setError(res.error);
      setError(null);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Emergency fund PIN changed");
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input className={field} type="password" inputMode="numeric" autoComplete="off" placeholder="Current PIN" value={current} onChange={(e) => setCurrent(digits(e.target.value))} aria-label="Current PIN" />
      <div className="grid grid-cols-2 gap-2">
        <input className={field} type="password" inputMode="numeric" autoComplete="off" placeholder="New PIN" value={next} onChange={(e) => setNext(digits(e.target.value))} aria-label="New PIN" />
        <input className={field} type="password" inputMode="numeric" autoComplete="off" placeholder="Confirm" value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} aria-label="Confirm new PIN" />
      </div>
      <p role="alert" className="min-h-4 text-xs text-budget-over">
        {error}
      </p>
      <button
        type="submit"
        disabled={saving || current.length < 4 || next.length < 4 || confirm.length < 4}
        className="flex h-11 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-40"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Change PIN"}
      </button>
    </form>
  );
}
