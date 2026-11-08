import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, History } from "lucide-react";
import { CategoryBreakdown, type BreakdownRow } from "@/components/category-breakdown";
import { CategoryChip } from "@/components/category-icon";
import { Reveal } from "@/components/reveal";
import { SegmentRing } from "@/components/ring";
import { Skeleton } from "@/components/ui/skeleton";
import { bandColorVar } from "@/lib/budget";
import { formatMonth, formatShort, isMonthKey, shiftMonth, toDate } from "@/lib/dates";
import { FIRST_MONTH, HISTORY, getHistorySummary, getMonthSummary, type CategoryTx } from "@/lib/data";
import { formatCents } from "@/lib/money";
import type { CategoryTotal, MonthSummary } from "@/lib/summary";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Summary" };

type Params = PageProps<"/summary/[month]">["params"];

export default function SummaryPage({ params }: PageProps<"/summary/[month]">) {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal fallback={<SummarySkeleton />}>
        <Summary params={params} />
      </Reveal>
    </div>
  );
}

const money = (c: number) => formatCents(c, { whole: true });

async function Summary({ params }: { params: Params }) {
  const { month } = await params;
  if (month === HISTORY.key) return <HistoryView />;
  if (!isMonthKey(month)) notFound();
  if (month < FIRST_MONTH) redirect(`/summary/${HISTORY.key}`);
  return <MonthView month={month} />;
}

// ───────────────────────────── one month ─────────────────────────────

async function MonthView({ month }: { month: string }) {
  const d = await getMonthSummary(month);
  const s = d.summary;
  const b = d.budget;
  const empty = s.spent === 0 && s.income === 0;
  const prevHref = month === FIRST_MONTH ? `/summary/${HISTORY.key}` : `/summary/${shiftMonth(month, -1)}`;
  const nextDisabled = d.isCurrent || d.isFuture;

  return (
    <div className="flex flex-col gap-5">
      <MonthNav
        title={formatMonth(month)}
        subtitle={d.isCurrent ? "So far this month" : undefined}
        prevHref={prevHref}
        prevLabel={month === FIRST_MONTH ? HISTORY.label : undefined}
        nextHref={nextDisabled ? null : `/summary/${shiftMonth(month, 1)}`}
      />

      {empty ? (
        <p className="rounded-2xl bg-surface-1 p-8 text-center text-sm text-muted-foreground">Nothing recorded for {formatMonth(month)} yet.</p>
      ) : (
        <>
          {/* Income vs spent */}
          <section className="rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Income" value={s.income} prev={d.previous?.income} tone="in" />
              <Stat label="Spent" value={s.spent} prev={d.previous?.spent} tone="out" />
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <Bar value={s.income} max={Math.max(s.income, s.spent, 1)} color="var(--money-in)" />
              <Bar value={s.spent} max={Math.max(s.income, s.spent, 1)} color="var(--foreground)" />
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">{s.net >= 0 ? "Left over" : "Overspent"}</span>
              <span className={cn("num text-lg font-semibold", s.net >= 0 ? "text-money-in" : "text-budget-over")}>
                {s.net >= 0 ? "+" : "−"}
                {money(Math.abs(s.net))}
              </span>
            </div>
          </section>

          {/* Budget */}
          {b.budget > 0 && (
            <Link href="/budgets" className="group block rounded-2xl bg-surface-1 p-4 transition-colors duration-(--duration-fast) hover:bg-surface-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Budget</h2>
                <span className="num text-sm">
                  <span className="font-semibold">{money(b.spent)}</span>
                  <span className="text-muted-foreground"> of {money(b.budget)}</span>
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.spent / b.budget) * 100)}%`, background: bandColorVar[b.band] }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label="Fixed" spent={b.fixed.spent} budget={b.fixed.budget} />
                <Mini label="Variable" spent={b.variable.spent} budget={b.variable.budget} />
                <div>
                  <span className="text-muted-foreground">Unplanned</span>
                  <span className={cn("num mt-0.5 block text-sm font-medium", b.unbudgeted > 0 && "text-budget-high")}>{money(b.unbudgeted)}</span>
                </div>
              </div>
            </Link>
          )}

          <CategoriesCard summary={s} transactions={d.transactions} prevByCat={d.previous ? d.prevByCat : undefined} />
          <IncomeCard summary={s} transactions={d.transactions} />
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Dec 2024 – Dec 2025 ─────────────────────────────

async function HistoryView() {
  const h = await getHistorySummary();
  const s = h.summary;
  const max = Math.max(1, ...h.months.flatMap((m) => [m.income, m.spent]));

  return (
    <div className="flex flex-col gap-5">
      <MonthNav
        title={HISTORY.label}
        subtitle="Money Pro history"
        prevHref={null}
        nextHref={`/summary/${FIRST_MONTH}`}
        nextLabel={formatMonth(FIRST_MONTH)}
      />

      <section className="rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Income" value={s.income} tone="in" />
          <Stat label="Spent" value={s.spent} tone="out" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
          <div>
            <span className="text-muted-foreground">{s.net >= 0 ? "Left over" : "Overspent"}</span>
            <span className={cn("num mt-0.5 block text-sm font-semibold", s.net >= 0 ? "text-money-in" : "text-budget-over")}>
              {s.net >= 0 ? "+" : "−"}
              {money(Math.abs(s.net))}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Avg spent / mo</span>
            <span className="num mt-0.5 block text-sm font-semibold">{money(h.avgSpent)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Avg in / mo</span>
            <span className="num mt-0.5 block text-sm font-semibold">{money(h.avgIncome)}</span>
          </div>
        </div>
      </section>

      {/* Month by month */}
      <section className="rounded-2xl bg-surface-1 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Month by month</h2>
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-money-in" />In</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-foreground" />Spent</span>
          </span>
        </div>
        <div className="flex h-36 items-end gap-1.5">
          {h.months.map((m) => (
            <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${formatMonth(m.month)}: in ${money(m.income)}, spent ${money(m.spent)}`}>
              <div className="flex h-full w-full items-end justify-center gap-[2px]">
                <div className="w-1/2 max-w-2 rounded-full bg-money-in" style={{ height: `${(m.income / max) * 100}%`, minHeight: m.income ? 3 : 0 }} />
                <div className="w-1/2 max-w-2 rounded-full bg-foreground" style={{ height: `${(m.spent / max) * 100}%`, minHeight: m.spent ? 3 : 0 }} />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Intl.DateTimeFormat("en-CA", { month: "narrow", timeZone: "UTC" }).format(toDate(`${m.month}-01`))}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {h.monthsRecorded} months with entries · Nov 9 – Dec 30, 2025 wasn&apos;t tracked.
        </p>
      </section>

      <CategoriesCard summary={s} transactions={h.transactions} />
      <IncomeCard summary={s} transactions={h.transactions} />

      {h.biggest.length > 0 && (
        <section className="rounded-2xl bg-surface-1 p-4">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">Biggest expenses</h2>
          <ul className="divide-y divide-border">
            {h.biggest.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <CategoryChip icon={t.category?.icon} color={t.category?.color} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{t.category?.name ?? t.description}</span>
                  <span className="text-xs text-muted-foreground">{formatShort(t.date)}, {t.date.slice(0, 4)}</span>
                </span>
                <span className="num text-sm font-medium">{formatCents(t.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ───────────────────────────── shared pieces ─────────────────────────────

function MonthNav({
  title,
  subtitle,
  prevHref,
  prevLabel,
  nextHref,
  nextLabel,
}: {
  title: string;
  subtitle?: string;
  prevHref: string | null;
  prevLabel?: string;
  nextHref: string | null;
  nextLabel?: string;
}) {
  const btn = "grid size-10 shrink-0 place-items-center rounded-xl bg-surface-1 transition-colors duration-(--duration-fast) hover:bg-surface-2";
  return (
    <header className="flex items-center justify-between gap-3">
      {prevHref ? (
        // prefetch: neighbours load before the tap (their data is privately cached for 5 min).
        <Link href={prevHref} prefetch className={btn} aria-label={prevLabel ? `Go to ${prevLabel}` : "Previous month"}>
          {prevLabel ? <History className="size-4" /> : <ChevronLeft className="size-5" />}
        </Link>
      ) : (
        <span className={cn(btn, "pointer-events-none opacity-30")} aria-hidden>
          <ChevronLeft className="size-5" />
        </span>
      )}
      <div className="min-w-0 text-center">
        <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {nextHref ? (
        <Link href={nextHref} prefetch className={btn} aria-label={nextLabel ? `Go to ${nextLabel}` : "Next month"}>
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span className={cn(btn, "pointer-events-none opacity-30")} aria-hidden>
          <ChevronRight className="size-5" />
        </span>
      )}
    </header>
  );
}

function CategoriesCard({
  summary: s,
  transactions,
  prevByCat,
}: {
  summary: MonthSummary;
  transactions: Record<string, CategoryTx[]>;
  prevByCat?: Record<string, number>;
}) {
  if (!s.expenses.length) return null;
  const top = s.expenses.slice(0, 6);
  const rest = s.expenses.slice(6).reduce((t, e) => t + e.cents, 0);
  const segments = [
    ...top.map((e) => ({ value: e.cents, color: e.category?.color ?? "#718096" })),
    ...(rest > 0 ? [{ value: rest, color: "var(--surface-3)" }] : []),
  ];
  const rows: BreakdownRow[] = s.expenses.map((e) => toRow(e, s.spent, transactions, prevByCat));
  return (
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
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Tap a category to see its transactions</p>
      <CategoryBreakdown rows={rows} className="mt-1" />
    </section>
  );
}

function IncomeCard({ summary: s, transactions }: { summary: MonthSummary; transactions: Record<string, CategoryTx[]> }) {
  if (!s.incomes.length) return null;
  const rows: BreakdownRow[] = s.incomes.map((e) => {
    const id = e.category?.id ?? "__none";
    return {
      id,
      name: e.category?.name ?? "Uncategorized",
      sub: `${e.count} ${e.count === 1 ? "deposit" : "deposits"}`,
      icon: e.category?.icon ?? null,
      color: e.category?.color ?? null,
      cents: e.cents,
      tone: "in",
      txs: transactions[id] ?? [],
    };
  });
  return (
    <section className="rounded-2xl bg-surface-1 p-4">
      <h2 className="mb-1 text-sm font-medium text-muted-foreground">Money in</h2>
      <CategoryBreakdown rows={rows} />
    </section>
  );
}

function toRow(e: CategoryTotal, spent: number, transactions: Record<string, CategoryTx[]>, prevByCat?: Record<string, number>): BreakdownRow {
  const c = e.category;
  const id = c?.id ?? "__none";
  const pct = Math.round((e.cents / spent) * 100);
  const prev = prevByCat?.[id] ?? 0;
  const diff = e.cents - prev;
  return {
    id,
    name: c?.name ?? "Uncategorized",
    sub: `${c?.parentName ?? "—"} · ${pct}%${c?.essential ? ` · ${c.essential === "fixed" ? "Fixed" : "Essential"}` : ""}`,
    icon: c?.icon ?? null,
    color: c?.color ?? null,
    cents: e.cents,
    aside:
      prevByCat && prev > 0 && diff !== 0 ? (
        <span className={cn("num text-[11px]", diff > 0 ? "text-budget-high" : "text-money-in")}>
          {diff > 0 ? "+" : "−"}
          {money(Math.abs(diff))}
        </span>
      ) : undefined,
    txs: transactions[id] ?? [],
  };
}

function Stat({ label, value, prev, tone }: { label: string; value: number; prev?: number; tone: "in" | "out" }) {
  const diff = prev != null ? value - prev : 0;
  const show = prev != null && prev > 0 && diff !== 0;
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

function Mini({ label, spent, budget }: { label: string; spent: number; budget: number }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <span className="num mt-0.5 block text-sm font-medium">
        {money(spent)}
        <span className="text-muted-foreground"> / {money(budget)}</span>
      </span>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-[200px] rounded-3xl" />
      <Skeleton className="h-[120px] rounded-2xl" />
      <Skeleton className="h-[360px] rounded-2xl" />
    </div>
  );
}
