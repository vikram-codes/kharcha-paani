"use client";

import { useEffect, useState } from "react";
import { Split } from "lucide-react";
import { loadAccount } from "@/app/actions/activity";
import { AnimatedCents } from "@/components/animated-number";
import { BackButton } from "@/components/back-button";
import { CategoryChip } from "@/components/category-icon";
import { TransactionSheet } from "@/components/transactions/transaction-sheet";
import { TRANSFER_HEX, rowSubtitle, rowTitle, spentOf } from "@/components/transactions/format";
import { UpdateBalance } from "@/components/update-balance";
import { bandColorVar, budgetBand } from "@/lib/budget";
import { notifyDataChanged, onDataChanged } from "@/lib/data-events";
import type { ActivityRow } from "@/lib/data";
import { formatDay } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Detail = NonNullable<Awaited<ReturnType<typeof loadAccount>>>;

/** One card or bank account: balance, details and its recent entries (tap to edit). */
export function AccountView({ initial }: { initial: Detail }) {
  const [a, setA] = useState(initial);
  const [open, setOpen] = useState<ActivityRow | null>(null);
  const reload = () => loadAccount(initial.id).then((d) => d && setA(d));
  useEffect(() => onDataChanged(() => void loadAccount(initial.id).then((d) => d && setA(d))), [initial.id]);

  const days: [string, ActivityRow[]][] = [];
  for (const r of a.rows) {
    const last = days[days.length - 1];
    if (last && last[0] === r.date) last[1].push(r);
    else days.push([r.date, [r]]);
  }
  const used = a.limit && a.owed != null ? Math.round((a.owed / a.limit) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <BackButton fallback={a.debt ? "/debts" : "/cash"} label={a.debt ? "Debts" : "Cash"} />

      <section className="-mt-2 rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{a.name}</h1>
            <p className="text-xs text-muted-foreground">
              {[a.last4 && `•••• ${a.last4}`, a.institution, a.apr && `${a.apr}% APR`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <UpdateBalance
            accountId={a.id}
            name={a.name}
            current={a.debt ? (a.owed ?? 0) : a.balance}
            debt={a.debt}
            onSaved={reload}
            trigger={
              <button type="button" className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-lime-ink">
                Update
              </button>
            }
          />
        </div>
        <p className="mt-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">{a.debt ? "Owed" : "Balance"}</p>
        <AnimatedCents value={a.debt ? (a.owed ?? 0) : a.balance} className="num block text-[40px] leading-none font-semibold tracking-tight" />
        {a.limit != null && used != null && (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, used)}%`, background: bandColorVar[budgetBand(a.owed ?? 0, a.limit)] }} />
            </div>
            <p className="num mt-1.5 text-[11px] text-muted-foreground">
              {used}% of {formatCents(a.limit, { whole: true })} limit · {formatCents(Math.max(0, a.limit - (a.owed ?? 0)))} available
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="-mb-2 px-1 text-sm font-medium text-muted-foreground">Recent entries</h2>
        {days.length === 0 && <p className="rounded-2xl bg-surface-1 p-6 text-center text-sm text-muted-foreground">No entries yet.</p>}
        {days.map(([day, rows]) => (
          <div key={day}>
            <div className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between bg-background/90 px-2 py-1.5 backdrop-blur">
              <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{day === a.today ? "Today" : formatDay(day)}</span>
              {spentOf(rows) > 0 && <span className="num text-xs text-muted-foreground">−{formatCents(spentOf(rows))}</span>}
            </div>
            <div className="divide-y divide-border rounded-2xl bg-surface-1 px-3">
              {rows.map((r) => (
                <button key={r.id} type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 py-3 text-left">
                  <CategoryChip
                    icon={r.isTransfer ? "arrow-left-right" : r.splits.length ? "circle-dot" : r.category?.icon}
                    color={r.isTransfer ? TRANSFER_HEX : r.category?.color}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{rowTitle(r)}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {r.splits.length > 0 && <Split className="size-3" />}
                      {rowSubtitle(r)}
                      {r.source === "mcp" && " · by Claude"}
                    </span>
                  </span>
                  <span className={cn("num shrink-0 text-sm font-medium", r.isTransfer ? "text-transfer" : r.amount_cents > 0 && "text-money-in")}>
                    {formatCents(r.amount_cents, { signed: r.amount_cents > 0 })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {a.rows.length >= 80 && <p className="text-center text-xs text-muted-foreground">Showing the latest 80. See Activity for older ones.</p>}
      </section>

      <TransactionSheet
        row={open}
        onClose={() => setOpen(null)}
        onChanged={() => {
          void reload();
          notifyDataChanged();
        }}
      />
    </div>
  );
}
