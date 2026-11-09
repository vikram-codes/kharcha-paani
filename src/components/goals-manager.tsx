"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteGoalAction, loadGoals, saveGoalAction } from "@/app/actions/planning";
import { AnimatedCents } from "@/components/animated-number";
import { MoneyInput, centsToInput, toCents } from "@/components/money-input";
import { ThemedSelect } from "@/components/themed-select";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof loadGoals>>;
type Draft = { id?: string; name: string; target: string; monthly: string; accountId: string | null };

const field = "h-11 w-full rounded-xl bg-surface-1 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime";

/** Savings goals (§7.8): target, monthly contribution, progress from a linked savings account. */
export function GoalsManager({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, start] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(msg);
      setDraft(null);
      setData(await loadGoals());
    });

  const monthlyTotal = data.goals.reduce((t, g) => t + g.monthly, 0);
  const accountOptions = data.accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Savings goals</h1>
          <p className="num text-sm text-muted-foreground">{monthlyTotal ? `${formatCents(monthlyTotal)} a month planned` : "Nothing planned yet"}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setConfirmDelete(false);
            setDraft({ name: "", target: "", monthly: "", accountId: data.accounts[0]?.id ?? null });
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-on-lime"
        >
          <Plus className="size-4" /> New goal
        </button>
      </header>

      {data.goals.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-lime-ink">
            <Target className="size-6" />
          </span>
          <p className="text-base font-semibold">No goals yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">Set a target (a trip, a car fund, a cushion) and how much goes in each month.</p>
        </div>
      )}

      {data.goals.map((g) => {
        const pct = g.saved != null ? Math.min(100, Math.round((g.saved / g.target) * 100)) : null;
        const left = g.saved != null ? Math.max(0, g.target - g.saved) : g.target;
        const months = g.monthly > 0 ? Math.ceil(left / g.monthly) : null;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              setDraft({ id: g.id, name: g.name, target: centsToInput(g.target), monthly: centsToInput(g.monthly), accountId: g.accountId });
            }}
            className="rounded-2xl bg-surface-1 p-4 text-left transition-colors duration-(--duration-fast) hover:bg-surface-2"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold">{g.name}</span>
              <span className="num shrink-0 text-sm">
                {g.saved != null && <AnimatedCents value={g.saved} whole className="font-semibold" />}
                <span className="text-muted-foreground"> {g.saved != null ? "of " : ""}{formatCents(g.target, { whole: true })}</span>
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-lime transition-[width] duration-700 ease-out" style={{ width: `${pct ?? 0}%` }} />
            </div>
            <p className="num mt-2 text-xs text-muted-foreground">
              {pct != null ? `${pct}% · ` : ""}
              {g.monthly ? `${formatCents(g.monthly, { whole: true })}/month` : "No monthly amount"}
              {months != null && left > 0 ? ` · about ${months} month${months === 1 ? "" : "s"} to go` : left === 0 ? " · reached 🎉" : ""}
              {g.account ? ` · ${g.account}` : " · not linked to an account"}
            </p>
          </button>
        );
      })}

      <Sheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <ResponsiveSheetContent>
          {draft && (
            <div className="flex flex-col gap-3 px-5 pt-2 pb-5 md:pt-5">
              <div>
                <SheetTitle className="text-lg font-semibold">{draft.id ? "Edit goal" : "New goal"}</SheetTitle>
                <SheetDescription className="text-xs">Progress follows the linked savings account&apos;s balance.</SheetDescription>
              </div>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Goal (e.g. India trip)" maxLength={60} className={field} aria-label="Goal name" />
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1 block px-1 text-xs text-muted-foreground">Target</span>
                  <MoneyInput value={draft.target} onChange={(v) => setDraft({ ...draft, target: v })} ariaLabel="Target" />
                </label>
                <label>
                  <span className="mb-1 block px-1 text-xs text-muted-foreground">Each month</span>
                  <MoneyInput value={draft.monthly} onChange={(v) => setDraft({ ...draft, monthly: v })} ariaLabel="Monthly amount" />
                </label>
              </div>
              <ThemedSelect ariaLabel="Linked account" value={draft.accountId} onChange={(v) => setDraft({ ...draft, accountId: v })} options={accountOptions} placeholder="Not linked" />
              <button
                type="button"
                disabled={busy || !draft.name.trim() || !toCents(draft.target)}
                onClick={() =>
                  act(
                    () => saveGoalAction({ id: draft.id, name: draft.name, targetCents: toCents(draft.target)!, monthlyCents: toCents(draft.monthly) ?? 0, accountId: draft.accountId }),
                    draft.id ? "Goal saved" : "Goal created",
                  )
                }
                className="flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-on-lime disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : draft.id ? "Save goal" : "Create goal"}
              </button>
              {draft.id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (confirmDelete ? act(() => deleteGoalAction(draft.id!), "Goal deleted") : setConfirmDelete(true))}
                  className={cn("flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium", confirmDelete ? "bg-budget-over text-white" : "bg-surface-1 text-budget-over")}
                >
                  <Trash2 className="size-4" /> {confirmDelete ? "Tap to confirm" : "Delete goal"}
                </button>
              )}
            </div>
          )}
        </ResponsiveSheetContent>
      </Sheet>
    </div>
  );
}
