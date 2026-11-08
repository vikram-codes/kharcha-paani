import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryChip } from "@/components/category-icon";
import { SegmentRing } from "@/components/ring";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMonth, isMonthKey, shiftMonth } from "@/lib/dates";
import { getMonthSummary } from "@/lib/data";
import { formatCents } from "@/lib/money";
import type { CategoryTotal } from "@/lib/summary";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Summary" };

export default function SummaryPage({ params }: PageProps<"/summary/[month]">) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-3xl">
      <Suspense fallback={<SummarySkeleton />}>
        <Summary params={params} />
      </Suspense>
    </div>
  );
}

const money = (c: number) => formatCents(c, { whole: true });
const GROUP_COLORS = { fixed: "#7C9CFF", variable: "#4FD1C5", discretionary: "var(--lime)" };

async function Summary({ params }: { params: PageProps<"/summary/[month]">["params"] }) {
  const { month } = await params;
  if (!isMonthKey(month)) notFound();
  const d = await getMonthSummary(month);
  const s = d.summary;
  const empty = s.spent === 0 && s.income === 0;

  // Top 6 categories + "Other" for the ring.
  const top = s.expenses.slice(0, 6);
  const rest = s.expenses.slice(6).reduce((t, e) => t + e.cents, 0);
  const segments = [
    ...top.map((e) => ({ value: e.cents, color: e.category?.color ?? "#718096" })),
    ...(rest > 0 ? [{ value: rest, color: "var(--surface-3)" }] : []),
  ];
  const maxBar = Math.max(s.income, s.spent, 1);

  return (
    <>
      {/* Month navigation */}
      <header className="flex items-center justify-between">
        <Link href={`/summary/${shiftMonth(month, -1)}`} className="grid size-10 place-items-center rounded-xl bg-surface-1" aria-label="Previous month">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">{formatMonth(month)}</h1>
          {d.isCurrent && <p className="text-xs text-muted-foreground">So far this month</p>}
        </div>
        <Link
          href={`/summary/${shiftMonth(month, 1)}`}
          aria-label="Next month"
          aria-disabled={d.isCurrent || d.isFuture}
          className={cn("grid size-10 place-items-center rounded-xl bg-surface-1", (d.isCurrent || d.isFuture) && "pointer-events-none opacity-30")}
        >
          <ChevronRight className="size-5" />
        </Link>
      </header>

      {empty ? (
        <p className="rounded-2xl bg-surface-1 p-8 text-center text-sm text-muted-foreground">
          Nothing recorded for {formatMonth(month)} yet.
        </p>
      ) : (
        <>
          {/* Income vs spent */}
          <section className="rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Income" value={s.income} prev={d.previous.income} tone="in" />
              <Stat label="Spent" value={s.spent} prev={d.previous.spent} tone="out" />
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <Bar value={s.income} max={maxBar} color="var(--money-in)" />
              <Bar value={s.spent} max={maxBar} color="var(--foreground)" />
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">{s.net >= 0 ? "Left over" : "Overspent"}</span>
              <span className={cn("num text-lg font-semibold", s.net >= 0 ? "text-money-in" : "text-budget-over")}>
                {s.net >= 0 ? "+" : "−"}
                {money(Math.abs(s.net))}
              </span>
            </div>
            {d.plannedIncome && d.isCurrent && (
              <p className="mt-1 text-xs text-muted-foreground">
                Planned income is {money(d.plannedIncome)} (2 paycheques).
              </p>
            )}
          </section>

          {/* Essentials vs discretionary */}
          {s.spent > 0 && (
            <section className="rounded-2xl bg-surface-1 p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">Where it went</h2>
              <div className="flex h-3 gap-1 overflow-hidden rounded-full">
                {(["fixed", "variable", "discretionary"] as const).map((k) =>
                  s[k] > 0 ? <div key={k} className="h-full rounded-full" style={{ flex: s[k], background: GROUP_COLORS[k] }} /> : null,
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Legend color={GROUP_COLORS.fixed} label="Fixed" value={s.fixed} />
                <Legend color={GROUP_COLORS.variable} label="Variable" value={s.variable} />
                <Legend color={GROUP_COLORS.discretionary} label="Fun money" value={s.discretionary} />
              </div>
            </section>
          )}

          {/* Categories */}
          {s.expenses.length > 0 && (
            <section className="rounded-2xl bg-surface-1 p-4">
              <div className="flex justify-center py-2">
                <SegmentRing segments={segments} size={200} stroke={18}>
                  <div>
                    <p className="text-xs text-muted-foreground">Spent</p>
                    <p className="num text-2xl font-semibold">{money(s.spent)}</p>
                    <p className="text-xs text-muted-foreground">{s.expenses.length} categories</p>
                  </div>
                </SegmentRing>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {s.expenses.map((e) => (
                  <CategoryRow key={e.category?.id ?? "none"} row={e} spent={s.spent} prev={d.prevByCat.get(e.category?.id ?? "__none") ?? 0} />
                ))}
              </ul>
            </section>
          )}

          {/* Income */}
          {s.incomes.length > 0 && (
            <section className="rounded-2xl bg-surface-1 p-4">
              <h2 className="mb-1 text-sm font-medium text-muted-foreground">Money in</h2>
              <ul className="divide-y divide-border">
                {s.incomes.map((e) => (
                  <li key={e.category?.id ?? "none"} className="flex items-center gap-3 py-3">
                    <CategoryChip icon={e.category?.icon} color={e.category?.color} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{e.category?.name ?? "Uncategorized"}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.count} {e.count === 1 ? "deposit" : "deposits"}
                      </span>
                    </span>
                    <span className="num text-sm font-medium text-money-in">+{formatCents(e.cents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value, prev, tone }: { label: string; value: number; prev: number; tone: "in" | "out" }) {
  const diff = value - prev;
  const show = prev > 0 && diff !== 0;
  const good = tone === "in" ? diff > 0 : diff < 0;
  return (
    <div>
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn("num mt-1 text-[28px] leading-none font-semibold tracking-tight", tone === "in" && "text-money-in")}>{money(value)}</p>
      {show && (
        <p className={cn("num mt-1.5 flex items-center gap-0.5 text-xs", good ? "text-money-in" : "text-budget-high")}>
          {diff > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {money(Math.abs(diff))} vs last month
        </p>
      )}
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="num mt-0.5 block text-sm font-medium">{money(value)}</span>
    </div>
  );
}

function CategoryRow({ row, spent, prev }: { row: CategoryTotal; spent: number; prev: number }) {
  const c = row.category;
  const pct = Math.round((row.cents / spent) * 100);
  const diff = row.cents - prev;
  return (
    <li className="flex items-center gap-3 py-3">
      <CategoryChip icon={c?.icon} color={c?.color} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{c?.name ?? "Uncategorized"}</span>
        <span className="truncate text-xs text-muted-foreground">
          {c?.parentName ?? "—"} · {pct}%
          {c?.essential && ` · ${c.essential === "fixed" ? "Fixed" : "Essential"}`}
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="num text-sm font-medium">{formatCents(row.cents)}</span>
        {prev > 0 && diff !== 0 && (
          <span className={cn("num text-[11px]", diff > 0 ? "text-budget-high" : "text-money-in")}>
            {diff > 0 ? "+" : "−"}
            {money(Math.abs(diff))}
          </span>
        )}
      </span>
    </li>
  );
}

function SummarySkeleton() {
  return (
    <>
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-[220px] rounded-3xl" />
      <Skeleton className="h-[110px] rounded-2xl" />
      <Skeleton className="h-[360px] rounded-2xl" />
    </>
  );
}
