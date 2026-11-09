"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, History } from "lucide-react";
import { loadSummary, type SummaryPayload } from "@/app/actions/summary";
import { onDataChanged } from "@/lib/data-events";
import { AnimatedCents } from "@/components/animated-number";
import { CategoryBreakdown, type BreakdownRow } from "@/components/category-breakdown";
import { MonthPicker } from "@/components/month-picker";
import { SegmentRing } from "@/components/ring";
import { bandColorVar } from "@/lib/budget";
import { formatMonth, formatShort, shiftMonth } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { FIRST_MONTH, HISTORY } from "@/lib/periods";
import type { CategoryTotal, MonthSummary } from "@/lib/summary";
import { cn } from "@/lib/utils";

type Tx = { id: string; date: string; reportOn?: string; description: string; account: string; amount_cents: number; split: boolean };

const money = (c: number) => formatCents(c, { whole: true });

function prevKey(key: string) {
  if (key === HISTORY.key) return null;
  return key === FIRST_MONTH ? HISTORY.key : shiftMonth(key, -1);
}
function nextKey(key: string, current: string) {
  if (key === HISTORY.key) return FIRST_MONTH;
  return key >= current ? null : shiftMonth(key, 1);
}
const keyFromPath = (path: string) => path.split("/")[2] ?? "";

/**
 * Summary month switcher. Changing month never blanks the screen: the current
 * month stays (dimmed, with a progress line) until the next one has loaded,
 * then the numbers roll to their new values. Neighbouring months are fetched in
 * the background, so arrows are usually instant. The URL is kept in sync with
 * history.pushState, so back/forward and refresh work.
 */
export function SummaryPager({ initial, current }: { initial: SummaryPayload; current: string }) {
  const pathname = usePathname();
  const urlKey = keyFromPath(pathname) || initial.key;
  const urlKeyRef = useRef(urlKey);
  useEffect(() => {
    urlKeyRef.current = urlKey;
  }, [urlKey]);
  const cache = useRef(new Map<string, SummaryPayload>([[initial.key, initial]]));
  const inflight = useRef(new Map<string, Promise<SummaryPayload>>());
  const [shown, setShown] = useState<SummaryPayload>(initial);
  const [error, setError] = useState<string | null>(null);

  const fetchKey = (key: string) => {
    const hit = cache.current.get(key);
    if (hit) return Promise.resolve(hit);
    let p = inflight.current.get(key);
    if (!p) {
      p = loadSummary(key).then((res) => {
        cache.current.set(key, res);
        inflight.current.delete(key);
        return res;
      });
      p.catch(() => inflight.current.delete(key));
      inflight.current.set(key, p);
    }
    return p;
  };

  // Show the month in the URL once its data is ready (keeps the old one meanwhile).
  useEffect(() => {
    if (shown.key === urlKey) return;
    let live = true;
    fetchKey(urlKey)
      .then((res) => live && (setShown(res), setError(null)))
      .catch(() => live && setError("Couldn't load that month. Check your connection."));
    return () => {
      live = false;
    };
  }, [urlKey, shown.key]);

  // Anything saved elsewhere → forget cached months and reload the one on screen.
  useEffect(
    () =>
      onDataChanged(() => {
        cache.current.clear();
        inflight.current.clear();
        loadSummary(urlKeyRef.current).then((res) => {
          cache.current.set(res.key, res);
          if (res.key === urlKeyRef.current) setShown(res);
        });
      }),
    [],
  );

  // Warm the neighbours once a month is on screen.
  useEffect(() => {
    const t = setTimeout(() => {
      for (const k of [prevKey(shown.key), nextKey(shown.key, current)]) if (k) fetchKey(k).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [shown.key, current]);

  const go = (key: string | null) => {
    if (!key || key === urlKey) return;
    window.history.pushState(null, "", `/summary/${key}`);
  };

  const loading = shown.key !== urlKey;
  const isHistory = urlKey === HISTORY.key;

  return (
    <div className="flex flex-col gap-5">
      {/* progress line while the next month loads */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden" aria-hidden>
        <div className={cn("h-full w-1/3 bg-lime transition-opacity duration-200", loading ? "animate-[kp-progress_0.9s_ease-in-out_infinite] opacity-100" : "opacity-0")} />
      </div>

      <MonthNav
        selected={urlKey}
        title={isHistory ? HISTORY.label : formatMonth(urlKey)}
        subtitle={isHistory ? "Dec 2024 – Dec 2025 · Money Pro" : urlKey === current ? "So far this month" : undefined}
        prev={prevKey(urlKey)}
        next={nextKey(urlKey, current)}
        onGo={go}
      />

      {error && <p className="rounded-xl bg-budget-over/10 px-4 py-3 text-sm text-budget-over">{error}</p>}

      <div className={cn("transition-opacity duration-200", loading && "opacity-50")} aria-busy={loading}>
        {shown.kind === "month" ? <MonthBody payload={shown} /> : <HistoryBody payload={shown} />}
      </div>
    </div>
  );
}

// ───────────────────────────── one month ─────────────────────────────

function MonthBody({ payload }: { payload: Extract<SummaryPayload, { kind: "month" }> }) {
  const d = payload.data;
  const s = d.summary;
  const b = d.budget;
  // "vs last month" only makes sense once a month is over.
  const compare = !d.isCurrent && d.previous ? d.previous : null;

  if (s.spent === 0 && s.income === 0 && s.adjustments === 0) {
    return <p className="rounded-2xl bg-surface-1 p-8 text-center text-sm text-muted-foreground">Nothing recorded for {formatMonth(payload.key)} yet.</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Income" value={s.income} prev={compare?.income} tone="in" />
          <Stat label="Spent" value={s.spent} prev={compare?.spent} tone="out" />
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <Bar value={s.income} max={Math.max(s.income, s.spent, 1)} color="var(--money-in)" />
          <Bar value={s.spent} max={Math.max(s.income, s.spent, 1)} color="var(--foreground)" />
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">{s.net >= 0 ? "Left over" : "Overspent"}</span>
          <AnimatedCents value={s.net} whole signed className={cn("num text-lg font-semibold", s.net >= 0 ? "text-money-in" : "text-budget-over")} />
        </div>
      </section>

      {b.total > 0 && (
        <section className="rounded-2xl bg-surface-1 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Budget</h2>
            <span className="num text-sm">
              <AnimatedCents value={b.spent} whole className="font-semibold" />
              <span className="text-muted-foreground"> of {money(b.total)}</span>
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, (b.spent / b.total) * 100)}%`, background: bandColorVar[b.band] }}
            />
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

      <CategoriesCard summary={s} transactions={d.transactions} prevByCat={compare ? d.prevByCat : undefined} />
      <IncomeCard summary={s} transactions={d.transactions} />
      <AdjustmentsCard total={s.adjustments} rows={d.adjustments} />
    </div>
  );
}

// ───────────────────────────── 2024–2025 ─────────────────────────────

function HistoryBody({ payload }: { payload: Extract<SummaryPayload, { kind: "history" }> }) {
  const h = payload.data;
  const s = h.summary;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Income" value={s.income} tone="in" />
          <Stat label="Spent" value={s.spent} tone="out" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
          <div>
            <span className="text-muted-foreground">{s.net >= 0 ? "Left over" : "Overspent"}</span>
            <AnimatedCents value={s.net} whole signed className={cn("num mt-0.5 block text-sm font-semibold", s.net >= 0 ? "text-money-in" : "text-budget-over")} />
          </div>
          <div>
            <span className="text-muted-foreground">Avg spent / mo</span>
            <AnimatedCents value={h.avgSpent} whole className="num mt-0.5 block text-sm font-semibold" />
          </div>
          <div>
            <span className="text-muted-foreground">Avg in / mo</span>
            <AnimatedCents value={h.avgIncome} whole className="num mt-0.5 block text-sm font-semibold" />
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

// ───────────────────────────── pieces ─────────────────────────────

function MonthNav({
  selected,
  title,
  subtitle,
  prev,
  next,
  onGo,
}: {
  selected: string;
  title: string;
  subtitle?: string;
  prev: string | null;
  next: string | null;
  onGo: (key: string | null) => void;
}) {
  const btn =
    "grid size-10 shrink-0 place-items-center rounded-xl bg-surface-1 transition-colors duration-(--duration-fast) hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30";
  const toHistory = prev === HISTORY.key;
  return (
    <header className="flex items-center justify-between gap-3">
      <button type="button" className={btn} disabled={!prev} onClick={() => onGo(prev)} aria-label={toHistory ? `Go to ${HISTORY.label}` : "Previous month"}>
        {toHistory ? <History className="size-4" /> : <ChevronLeft className="size-5" />}
      </button>
      <h1 className="min-w-0">
        <MonthPicker title={title} subtitle={subtitle} selected={selected} history={{ key: HISTORY.key, label: HISTORY.label }} onSelect={onGo} />
      </h1>
      <button type="button" className={btn} disabled={!next} onClick={() => onGo(next)} aria-label="Next month">
        <ChevronRight className="size-5" />
      </button>
    </header>
  );
}

function CategoriesCard({ summary: s, transactions, prevByCat }: { summary: MonthSummary; transactions: Record<string, Tx[]>; prevByCat?: Record<string, number> }) {
  if (!s.expenses.length) return null;
  const top = s.expenses.slice(0, 6);
  const rest = s.expenses.slice(6).reduce((t, e) => t + e.cents, 0);
  const segments = [
    ...top.map((e) => ({ value: e.cents, color: e.category?.color ?? "#718096" })),
    ...(rest > 0 ? [{ value: rest, color: "var(--surface-3)" }] : []),
  ];
  return (
    <section className="rounded-2xl bg-surface-1 p-4">
      <div className="flex justify-center py-2">
        <SegmentRing segments={segments} size={200} stroke={18}>
          <div>
            <p className="text-xs text-muted-foreground">Spent</p>
            <AnimatedCents value={s.spent} whole className="num block text-2xl font-semibold" />
            <p className="text-xs text-muted-foreground">{s.expenses.length} categories</p>
          </div>
        </SegmentRing>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Tap a category to see its transactions</p>
      <CategoryBreakdown rows={s.expenses.map((e) => toRow(e, s.spent, transactions, prevByCat))} className="mt-1" />
    </section>
  );
}

function IncomeCard({ summary: s, transactions }: { summary: MonthSummary; transactions: Record<string, Tx[]> }) {
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

function AdjustmentsCard({ total, rows }: { total: number; rows: Tx[] }) {
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

function toRow(e: CategoryTotal, spent: number, transactions: Record<string, Tx[]>, prevByCat?: Record<string, number>): BreakdownRow {
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
      <AnimatedCents value={value} whole className={cn("num mt-1 block text-[28px] leading-none font-semibold tracking-tight", tone === "in" && "text-money-in")} />
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
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${(value / max) * 100}%`, background: color }} />
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
