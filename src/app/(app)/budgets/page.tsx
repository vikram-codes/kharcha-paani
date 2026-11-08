import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryBreakdown, type BreakdownRow } from "@/components/category-breakdown";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { bandColorVar, type BudgetLineStatus } from "@/lib/budget";
import { formatMonthName } from "@/lib/dates";
import { getBudgets, type CategoryTx } from "@/lib/data";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal fallback={<BudgetsSkeleton />}>
        <Budgets />
      </Reveal>
    </div>
  );
}

const money = (c: number) => formatCents(c, { whole: true });

async function Budgets() {
  const d = await getBudgets();
  const s = d.status;
  const left = s.budget - s.spent;
  const fixed = s.lines.filter((l) => l.kind === "fixed");
  const variable = s.lines.filter((l) => l.kind === "variable");
  const unplanned = Object.entries(d.transactions).filter(([id]) => !s.lines.some((l) => l.categoryIds.includes(id)));

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{formatMonthName(d.month)} budget</p>
        <p className="num mt-2 text-[40px] leading-none font-semibold tracking-tight">
          {money(s.spent)}
          <span className="text-lg font-medium text-muted-foreground"> / {money(s.budget)}</span>
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.spent / Math.max(1, s.budget)) * 100)}%`, background: bandColorVar[s.band] }} />
        </div>
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span className={cn("num", left < 0 && "text-budget-over")}>
            {left >= 0 ? `${money(left)} left` : `${money(-left)} over`}
          </span>
          {d.daysLeft > 0 && <span>{d.daysLeft} days left</span>}
        </div>
      </section>

      <Group title="Fixed" spent={s.fixed.spent} budget={s.fixed.budget} lines={fixed} transactions={d.transactions} />
      <Group title="Variable" spent={s.variable.spent} budget={s.variable.budget} lines={variable} transactions={d.transactions} />

      {unplanned.length > 0 && (
        <section className="rounded-2xl border border-dashed border-border p-4">
          <h2 className="text-sm font-medium">Unplanned · {money(s.unbudgeted)}</h2>
          <p className="mb-1 text-xs text-muted-foreground">Spending in categories that aren&apos;t in any budget line.</p>
          <CategoryBreakdown
            rows={unplanned.map(([id, txs]) => {
              const c = d.categoryNames[id];
              return {
                id,
                name: c?.name ?? "Uncategorized",
                icon: c?.icon ?? null,
                color: c?.color ?? null,
                cents: -txs.reduce((t, x) => t + x.amount_cents, 0),
                txs,
              };
            })}
          />
        </section>
      )}

      <Link href={`/summary/${d.month}`} className="flex items-center justify-between rounded-2xl bg-surface-1 p-4 text-sm font-medium hover:bg-surface-2">
        {formatMonthName(d.month)} summary
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
}

function Group({
  title,
  spent,
  budget,
  lines,
  transactions,
}: {
  title: string;
  spent: number;
  budget: number;
  lines: BudgetLineStatus[];
  transactions: Record<string, CategoryTx[]>;
}) {
  const rows: BreakdownRow[] = lines.map((l) => {
    const txs = l.categoryIds.flatMap((id) => transactions[id] ?? []).sort((a, b) => (a.date < b.date ? 1 : -1));
    const left = l.budget - l.spent;
    return {
      id: l.id,
      name: l.name,
      icon: l.icon,
      color: l.color,
      cents: l.spent,
      sub:
        l.kind === "fixed"
          ? l.paid
            ? l.spent > l.budget
              ? `${money(l.spent - l.budget)} more than planned`
              : "Paid ✓"
            : `${money(l.budget)} planned`
          : left >= 0
            ? `${money(left)} left of ${money(l.budget)}`
            : `${money(-left)} over ${money(l.budget)}`,
      aside: <span className="num text-[11px] text-muted-foreground">{l.pct}%</span>,
      progress: { value: l.budget > 0 ? l.spent / l.budget : l.spent > 0 ? 1 : 0, color: l.kind === "fixed" && l.band === "ok" ? "var(--surface-3)" : bandColorVar[l.band] },
      txs,
    };
  });
  return (
    <section className="rounded-2xl bg-surface-1 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <span className="num text-sm">
          <span className="font-medium">{money(spent)}</span>
          <span className="text-muted-foreground"> / {money(budget)}</span>
        </span>
      </div>
      <CategoryBreakdown rows={rows} className="mt-1" />
    </section>
  );
}

function BudgetsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-[170px] rounded-3xl" />
      <Skeleton className="h-[420px] rounded-2xl" />
      <Skeleton className="h-[320px] rounded-2xl" />
    </div>
  );
}
