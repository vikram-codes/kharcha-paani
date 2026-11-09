"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { dismissAction, moveToSavingsAction } from "@/app/actions/planning";
import { MoneyInput, centsToInput, toCents } from "@/components/money-input";
import { formatDay, formatMonthName } from "@/lib/dates";
import type { SavingsPrompt } from "@/lib/savings-prompts";

/** "Move it to savings?" card on Home (3rd paycheque / month-end leftover). */
export function SavingsPromptCard({ prompt }: { prompt: SavingsPrompt }) {
  const router = useRouter();
  const [amount, setAmount] = useState(centsToInput(prompt.amount_cents));
  const [busy, start] = useTransition();
  const cents = toCents(amount);

  const title =
    prompt.kind === "third-pay"
      ? `3rd paycheque in ${formatMonthName(prompt.month)}`
      : `You came in under budget in ${formatMonthName(prompt.month)}`;
  const body =
    prompt.kind === "third-pay"
      ? `It landed ${formatDay(prompt.payday)}. Your plan says the 3rd paycheque goes straight to savings.`
      : "What's left isn't carried over. Move it to savings so it stays saved?";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(msg);
      router.refresh();
    });

  return (
    <section className="rounded-2xl bg-surface-1 p-4 ring-1 ring-lime/40">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime/15 text-lime-ink">
          <PiggyBank className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <MoneyInput value={amount} onChange={setAmount} ariaLabel="Amount to move to savings" className="bg-surface-2" />
        <button
          type="button"
          disabled={busy || !cents}
          onClick={() => run(() => moveToSavingsAction(cents!, prompt.key), "Moved to savings (chequing → savings)")}
          className="flex items-center justify-center rounded-xl bg-lime px-4 text-sm font-semibold text-on-lime disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Move to savings"}
        </button>
      </div>
      <button type="button" disabled={busy} onClick={() => run(() => dismissAction(prompt.key), "Okay, not this time")} className="mt-2 w-full text-center text-xs text-muted-foreground">
        Not this time
      </button>
    </section>
  );
}
