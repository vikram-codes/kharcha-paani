import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, History } from "lucide-react";
import { MonthPicker } from "@/components/month-picker";
import { CategoryBreakdown, type BreakdownRow } from "@/components/category-breakdown";
import { Reveal } from "@/components/reveal";
import { SegmentRing } from "@/components/ring";
import { Skeleton } from "@/components/ui/skeleton";
import { bandColorVar } from "@/lib/budget";
import { formatMonth, formatShort, isMonthKey, shiftMonth } from "@/lib/dates";
import { FIRST_MONTH, HISTORY, getHistorySummary, getMonthIndex, getMonthSummary, type CategoryTx } from "@/lib/data";
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

type MonthIndex = Awaited<ReturnType<typeof getMonthIndex>>;

async function MonthView({ month }: { month: string }) {
  const [d, index] = await Promise.all([getMonthSummary(month), getMonthIndex()]);
  const s = d.summary;
  const b = d.budget;
  const empty = s.spent === 0 && s.income === 0 && s.adjustments === 0;
  const prevHref = month === FIRST_MONTH ? `/summary/${HISTORY.key}` : `/summary/${shiftMonth(month, -1)}`;
  const nextDisabled = d.isCurrent || d.isFuture;

  return (
    <div className="flex flex-col gap-5">
      <MonthNav
        index={index}
        selected={month}
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
          {b.total > 0 && (
            <section className="rounded-2xl bg-surface-1 p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Budget</h2>
                <span className="num text-sm">
                  <span className="font-semibold">{money(b.spent)}</span>
                  <span className="text-muted-foreground"> of {money(b.total)}</span>
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.spent / b.total) * 100)}%`, background: bandColorVar[b.band] }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label="Fixed" spent={b.fixed.spent} budget={b.fixed.budget} />
                <Mini label="Variable" spent={b.variable.spent} budget={b.variable.budget} />
                <div>
                  <span className="text-muted-foreground">Unplanned</span>
                  <span className={cn("num mt-0.5 block text-sm font-medium", b.unbudgeted > 0 && "text-budget-high")}>{money(b.unbudgeted)}</span>
                </div>
              </div>
            </section>
          )}

          <CategoriesCard summary={s} transactions={d.transactions} prevByCat={d.previous ? d.prevByCat : undefined} />
          <IncomeCard summary={s} transactions={d.transactions} />
          <AdjustmentsCard total={s.adjustments} rows={d.adjustments} />
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Dec 2024 – Dec 2025 ─────────────────────────────

async function HistoryView() {
  const [h, index] = await Promise.all([getHistorySummary(), getMonthIndex()]);
  const s = h.summary;

  return (
    <div className="flex flex-col gap-5">
      <MonthNav
        index={index}
        selected={HISTORY.key}
        title={HISTORY.label}
        subtitle="Dec 2024 – Dec 2025 · Money Pro"
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
        <p className="mt-3 text-xs text-muted-foreground">Averages over the {h.monthsRecorded} months with entries.</p>
      </section>

      <CategoriesCard summary={s} transactions={h.transactions} />
      <IncomeCard summary={s} transactions={h.transactions} />
      <AdjustmentsCard total={s.adjustments} rows={h.adjustments} />
    </div>
  );
}

// ───────────────────────────── shared pieces ─────────────────────────────

function MonthNav({
  index,
  selected,
  title,
  subtitle,
  prevHref,
  prevLabel,
  nextHref,
  nextLabel,
}: {
  index: MonthIndex;
  selected: string;
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
      <h1 className="min-w-0">
        <MonthPicker
          title={title}
          subtitle={subtitle}
          selected={selected}
          current={index.current}
          months={index.months}
          history={{ key: HISTORY.key, label: HISTORY.label }}
        />
      </h1>
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

function AdjustmentsCard({ total, rows }: { total: number; rows: CategoryTx[] }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-dashed border-border p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Adjustments</h2>
        <span className="num text-sm font-medium">{formatCents(total, { signed: true })}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">Balance corrections. Not counted as income or spending.</p>
      <ul className="mt-2 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2.5">
            <span className="num w-12 shrink-0 text-[11px] text-muted-foreground">{formatShort(r.date)}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{r.description}</span>
            <span className="num text-sm">{formatCents(r.amount_cents, { signed: true })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
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
