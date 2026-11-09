"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { addInvestmentAction, archiveInvestmentAction, loadInvestments } from "@/app/actions/planning";
import { AnimatedCents } from "@/components/animated-number";
import { BackButton } from "@/components/back-button";
import { MoneyInput, toCents } from "@/components/money-input";
import { UpdateBalance } from "@/components/update-balance";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Inv = Awaited<ReturnType<typeof loadInvestments>>[number];

const field = "h-11 w-full rounded-xl bg-surface-1 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime";

/** Investments (§3.3): accounts you name, values you update; each update is a dated point. */
export function InvestmentsManager({ initial }: { initial: Inv[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [value, setValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const total = list.reduce((t, i) => t + i.value, 0);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(msg);
      setAdding(false);
      setConfirmRemove(null);
      setList(await loadInvestments());
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <BackButton fallback="/" />
      <header className="-mt-3 flex items-end justify-between px-1">
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Investments</p>
          <AnimatedCents value={total} className="num mt-1 block text-[40px] leading-none font-semibold tracking-tight" />
        </div>
        <button
          type="button"
          onClick={() => {
            setName("");
            setInstitution("");
            setValue("");
            setAdding(true);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-on-lime"
        >
          <Plus className="size-4" /> Add account
        </button>
      </header>

      {list.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-lime-ink">
            <TrendingUp className="size-6" />
          </span>
          <p className="text-base font-semibold">No investments yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">Add a TFSA, RRSP or brokerage account, then update its value whenever you check it.</p>
        </div>
      )}

      {list.map((i) => {
        const first = i.history[0]?.cents ?? i.value;
        const change = i.value - first;
        return (
          <section key={i.id} className="rounded-2xl bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{i.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {i.institution ? `${i.institution} · ` : ""}
                  {i.updated ? `updated ${formatShort(i.updated)}` : "no value yet"}
                </p>
              </div>
              <UpdateBalance
                accountId={i.id}
                name={i.name}
                current={i.value}
                debt={false}
                onSaved={() => loadInvestments().then(setList)}
                trigger={
                  <button type="button" className="flex flex-col items-end" aria-label={`Update ${i.name} value`}>
                    <AnimatedCents value={i.value} className="num text-lg font-semibold" />
                    <span className="text-[11px] text-lime-ink">Update value</span>
                  </button>
                }
              />
            </div>
            {i.history.length > 1 && (
              <div className="mt-3 flex items-end gap-3">
                <Sparkline points={i.history.map((h) => h.cents)} />
                <span className={cn("num shrink-0 text-xs", change >= 0 ? "text-money-in" : "text-budget-over")}>
                  {formatCents(change, { signed: true, whole: true })} since {formatShort(i.history[0].date)}
                </span>
              </div>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => (confirmRemove === i.id ? act(() => archiveInvestmentAction(i.id), `${i.name} removed`) : setConfirmRemove(i.id))}
              className={cn("mt-3 text-xs", confirmRemove === i.id ? "font-medium text-budget-over" : "text-muted-foreground")}
            >
              {confirmRemove === i.id ? "Tap again to remove (history is kept)" : "Remove account"}
            </button>
          </section>
        );
      })}

      <Sheet open={adding} onOpenChange={setAdding}>
        <ResponsiveSheetContent>
          <div className="flex flex-col gap-3 px-5 pt-2 pb-5 md:pt-5">
            <div>
              <SheetTitle className="text-lg font-semibold">Add investment account</SheetTitle>
              <SheetDescription className="text-xs">Values are updated by you, whenever you check them.</SheetDescription>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. TFSA)" maxLength={60} className={field} aria-label="Account name" />
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Where (e.g. Wealthsimple), optional" maxLength={60} className={cn(field, "placeholder:text-muted-foreground/70")} aria-label="Institution" />
            <MoneyInput value={value} onChange={setValue} ariaLabel="Current value" />
            <button
              type="button"
              disabled={busy || !name.trim() || toCents(value) == null}
              onClick={() => act(() => addInvestmentAction({ name, institution, valueCents: toCents(value)! }), `${name} added`)}
              className="flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-on-lime disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : "Add account"}
            </button>
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 160;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-1" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--lime)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
