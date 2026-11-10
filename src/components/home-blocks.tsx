import Link from "next/link";
import { ChevronRight, CreditCard, TrendingUp } from "lucide-react";
import { AnimatedCents } from "@/components/animated-number";
import { CashCard } from "@/components/cash-card";
import { AddBillBadge } from "@/components/bills/add-bill-badge";
import { dueLabel } from "@/lib/bill-due";
import { CategoryChip } from "@/components/category-icon";
import { HomeTile } from "@/components/home-tile";
import { SegmentRing } from "@/components/ring";
import { TRANSFER_HEX, mergeTransfers, rowSubtitle, rowTitle, transferSubtitle, transferTitle } from "@/components/transactions/format";
import { Amount } from "@/components/transactions/amount";
import { bandColorVar } from "@/lib/budget";
import { activityData, getHome, monthSummaryData } from "@/lib/data";
import { daysBetween, formatDay, formatMonthName, formatShort, monthKey, todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Home building blocks (layout A, owner picked Nov 9 2026). */
export async function loadWideHome() {
  // All three loads in parallel (they only share the month, which is today's).
  const month = monthKey(todayISO());
  const [h, m, a] = await Promise.all([getHome(), monthSummaryData(month), activityData(month)]);
  return { h, summary: m.summary, recent: mergeTransfers(a.rows).slice(0, 6) };
}
type Data = Awaited<ReturnType<typeof loadWideHome>>;

export function Greeting({ h }: { h: Data["h"] }) {
  return (
    <header className="px-1">
      <p className="text-sm text-muted-foreground">{formatDay(h.today)}</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {h.greeting}
        {h.name ? `, ${h.name}` : ""}
      </h1>
    </header>
  );
}

export function Cash({ h }: { h: Data["h"] }) {
  return (
    <CashCard bankTotal={h.cash} accounts={h.cashAccounts} emergencyInstitution={h.emergencyInstitution} owedToMe={h.owedToMe} paydayLabel={h.nextPayday ? formatDay(h.nextPayday) : null} />
  );
}

export function Budget({ h, className }: { h: Data["h"]; className?: string }) {
  const pct = h.budget ? Math.round((h.spent / h.budget) * 100) : 0;
  const left = h.budget - h.spent;
  return (
    <Link href={`/summary/${h.month}`} className={cn("group flex flex-col rounded-2xl bg-surface-1 p-4 transition-colors duration-(--duration-fast) hover:bg-surface-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Spent in {formatMonthName(h.month)}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {pct}% <ChevronRight className="size-4" />
        </span>
      </div>
      <p className="mt-1 flex items-baseline gap-1.5">
        <AnimatedCents value={h.spent} whole className="num text-3xl font-semibold tracking-tight" />
        <span className="num text-sm text-muted-foreground">of {formatCents(h.budget, { whole: true })}</span>
      </p>
      <div className="mt-auto pt-3">
        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: bandColorVar[h.band] }} />
        </div>
        <p className="num mt-2 text-xs text-muted-foreground">
          {left >= 0 ? `${formatCents(left, { whole: true })} left` : `${formatCents(-left, { whole: true })} over`} · {h.daysLeft} days left
        </p>
      </div>
    </Link>
  );
}

export function Tiles({ h, cols }: { h: Data["h"]; cols: 1 | 2 }) {
  return (
    <section className={cn("grid gap-2", cols === 2 && "md:grid-cols-2")}>
      <HomeTile href="/debts" icon={CreditCard} label="Debts" value={h.debts} sub={`${h.debtCounts.cards} cards${h.debtCounts.plans ? ` · ${h.debtCounts.plans} Affirm plans` : ""}`} />
      <HomeTile href="/investments" icon={TrendingUp} label="Investments" value={h.investments} sub={h.investmentCount ? `${h.investmentCount} accounts` : "Add your first account"} />
    </section>
  );
}

export function ComingUp({ h }: { h: Data["h"] }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-muted-foreground">Coming up</h2>
        <Link href="/bills" className="text-xs font-medium text-lime-ink">
          Manage
        </Link>
      </div>
      <div className="rounded-2xl border border-dashed border-border px-4 py-1">
        {h.upcoming.map((u) => {
          const inDays = daysBetween(h.today, u.date);
          return (
            <div key={u.id} className="flex items-center gap-3 py-2.5">
              {/* Not spent yet: faded, except the Add badge. */}
              <div className={cn("flex min-w-0 flex-1 items-center gap-3", !u.addNow && "opacity-60")}>
                <CategoryChip icon={u.icon} color={u.color} size="sm" dashed />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{u.name}</span>
                  <span className={cn("truncate text-xs", inDays < 0 ? "text-budget-high" : "text-muted-foreground")}>
                    {formatShort(u.date)} · {dueLabel(inDays)}
                  </span>
                </span>
                <span className="num text-sm">{formatCents(u.amount_cents)}</span>
              </div>
              {u.addNow && <AddBillBadge bill={u} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TopCategories({ d }: { d: Data }) {
  const top = d.summary.expenses.slice(0, 5);
  const rest = d.summary.expenses.slice(5).reduce((t, e) => t + e.cents, 0);
  return (
    <section className="rounded-2xl bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Where it went</h2>
        <Link href={`/summary/${d.h.month}`} className="text-xs font-medium text-lime-ink">
          Summary
        </Link>
      </div>
      <div className="flex items-center gap-5">
        <SegmentRing segments={[...top.map((e) => ({ value: e.cents, color: e.category?.color ?? "#718096" })), ...(rest > 0 ? [{ value: rest, color: "var(--surface-3)" }] : [])]} size={120} stroke={13}>
          <span className="num text-sm font-semibold">{formatCents(d.summary.spent, { whole: true })}</span>
        </SegmentRing>
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
          {top.map((e) => (
            <li key={e.category?.id ?? "x"} className="flex items-center gap-2 text-sm">
              <span className="size-2 shrink-0 rounded-full" style={{ background: e.category?.color ?? "#718096" }} />
              <span className="min-w-0 flex-1 truncate">{e.category?.name ?? "Uncategorized"}</span>
              <span className="num text-muted-foreground">{formatCents(e.cents, { whole: true })}</span>
            </li>
          ))}
          {!top.length && <li className="text-sm text-muted-foreground">Nothing yet this month.</li>}
        </ul>
      </div>
    </section>
  );
}

export function Recent({ d }: { d: Data }) {
  return (
    <section className="rounded-2xl bg-surface-1 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Recent</h2>
        <Link href="/transactions" className="text-xs font-medium text-lime-ink">
          All transactions
        </Link>
      </div>
      <div className="divide-y divide-border">
        {d.recent.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-2.5">
            <CategoryChip icon={r.isTransfer ? "arrow-left-right" : r.category?.icon} color={r.isTransfer ? TRANSFER_HEX : r.category?.color} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{r.isTransfer ? transferTitle(r) : rowTitle(r)}</span>
              <span className="truncate text-xs text-muted-foreground">
                {formatShort(r.date)} · {r.isTransfer ? transferSubtitle(r) : rowSubtitle(r)}
              </span>
            </span>
            <Amount r={r} />
          </div>
        ))}
      </div>
    </section>
  );
}
