"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Search, Split } from "lucide-react";
import { loadActivity, searchTransactions } from "@/app/actions/activity";
import { onDataChanged } from "@/lib/data-events";
import { AddBillBadge } from "@/components/bills/add-bill-badge";
import { CategoryChip } from "@/components/category-icon";
import type { ActivityRow, Upcoming } from "@/lib/data";
import { formatDay, formatMonth, formatShort, shiftMonth } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Amount } from "./amount";
import { TRANSFER_HEX, mergeTransfers, rowSubtitle, rowTitle, shortAccount, spentOf, transferSubtitle, transferTitle, type FeedRow } from "./format";
import { TransactionSheet } from "./transaction-sheet";

type Activity = { month: string; today: string; current: string; rows: ActivityRow[]; upcoming: Upcoming[] };
type Filter = "all" | "cards" | "chequing" | "in";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cards", label: "Cards" },
  { key: "chequing", label: "Chequing" },
  { key: "in", label: "Money in" },
];

const monthFromPath = (path: string) => (/^\/transactions\/(\d{4}-\d{2})$/.exec(path)?.[1] ?? null);

/**
 * Transactions (owner picked layout A, Nov 8 2026): search + filters, upcoming
 * bills greyed, rows grouped by day with each day's spending. Months switch in
 * place (old list stays, dimmed, until the next loads). Tap a row to edit.
 */
export function TransactionsView({ initial, firstMonth, openId }: { initial: Activity; firstMonth: string; openId?: string }) {
  const pathname = usePathname();
  const urlMonth = monthFromPath(pathname) ?? initial.current;
  const cache = useRef(new Map<string, Activity>([[initial.month, initial]]));
  const [shown, setShown] = useState<Activity>(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showTransfers, setShowTransfers] = useState(true);
  // Opened from a notification (?tx=<id>): that transaction starts open.
  const [open, setOpen] = useState<ActivityRow | null>(() => (openId ? (initial.rows.find((r) => r.id === openId) ?? null) : null));
  const [reload, setReload] = useState(0);

  // Load the month in the URL (keeps the current list until it arrives).
  // `wanted` makes late responses for a month you've already left harmless.
  const wanted = useRef(`${initial.month}:0`);
  useEffect(() => {
    const key = `${urlMonth}:${reload}`;
    if (wanted.current === key) return;
    wanted.current = key;
    const hit = cache.current.get(urlMonth);
    if (hit) {
      setShown(hit);
      return;
    }
    loadActivity(urlMonth).then((a) => {
      cache.current.set(urlMonth, a);
      if (wanted.current === key) setShown(a);
    });
  }, [urlMonth, reload]);

  const go = (m: string | null) => {
    if (!m) return;
    window.history.pushState(null, "", m === initial.current ? "/transactions" : `/transactions/${m}`);
  };
  const refresh = () => {
    cache.current.clear();
    setReload((n) => n + 1);
  };

  // Anything saved elsewhere (quick-add, imports, Claude via refresh) → reload this month.
  useEffect(() => onDataChanged(refresh), []);

  // Search looks through every month (owner, Nov 10 2026). Until the results
  // arrive, this month's matches show straight away.
  const needle = q.trim().toLowerCase();
  const [found, setFound] = useState<{ q: string; rows: ActivityRow[]; more: boolean } | null>(null);
  useEffect(() => {
    if (needle.length < 2) return;
    const t = setTimeout(() => {
      searchTransactions(needle).then((res) => setFound({ q: needle, rows: res.rows, more: res.more }));
    }, 250);
    return () => clearTimeout(t);
  }, [needle, reload]);
  const results = needle.length >= 2 && found?.q === needle ? found : null;
  const searching = needle.length >= 2 && !results;

  const list = useMemo(() => {
    // Each transfer once, read from chequing's side (owner, Nov 10 2026).
    return mergeTransfers(results ? results.rows : shown.rows).filter((r) => {
      if (!showTransfers && r.isTransfer) return false;
      if (filter === "cards" && r.accountGroup !== "debt_card") return false;
      if (filter === "chequing" && !/chequing/i.test(r.account)) return false;
      if (filter === "in" && (r.flow ?? r.amount_cents) <= 0) return false;
      if (!needle || results) return true;
      return [r.description, r.note ?? "", r.category?.name ?? "", r.account, rowTitle(r)].some((s) => s.toLowerCase().includes(needle));
    });
  }, [shown.rows, results, needle, filter, showTransfers]);

  const days = useMemo(() => {
    const m = new Map<string, FeedRow[]>();
    for (const r of list) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [list]);

  const loading = shown.month !== urlMonth;
  const thisYear = shown.today.slice(0, 4);
  const dayLabel = (day: string) =>
    day === shown.today ? "Today" : day.slice(0, 4) === thisYear ? formatDay(day) : `${formatDay(day)}, ${day.slice(0, 4)}`;
  const prev = urlMonth > firstMonth ? shiftMonth(urlMonth, -1) : null;
  const next = urlMonth < initial.current ? shiftMonth(urlMonth, 1) : null;
  const navBtn = "grid size-10 shrink-0 place-items-center rounded-xl bg-surface-1 transition-colors duration-(--duration-fast) hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex flex-col gap-4">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden" aria-hidden>
        <div className={cn("h-full w-1/3 bg-lime transition-opacity duration-200", loading || searching ? "animate-[kp-progress_0.9s_ease-in-out_infinite] opacity-100" : "opacity-0")} />
      </div>

      <header className="flex items-center justify-between gap-3">
        <button type="button" className={navBtn} disabled={!prev} onClick={() => go(prev)} aria-label="Previous month">
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-lg font-semibold tracking-tight">{needle.length >= 2 ? "All months" : formatMonth(urlMonth)}</h1>
          <p className="num text-xs text-muted-foreground">
            {needle.length >= 2
              ? results
                ? `${list.length}${results.more ? "+" : ""} result${list.length === 1 ? "" : "s"} for “${q.trim()}”`
                : "Searching every month…"
              : shown.month === urlMonth
                ? `${shown.rows.length} transactions · −${formatCents(spentOf(shown.rows), { whole: true })} spent`
                : "Loading…"}
          </p>
        </div>
        <button type="button" className={navBtn} disabled={!next} onClick={() => go(next)} aria-label="Next month">
          <ChevronRight className="size-5" />
        </button>
      </header>

      <div className="flex flex-col gap-2">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-surface-1 px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-lime">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all months: merchant, category, note" className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setFilter(x.key)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium", filter === x.key ? "bg-foreground text-background" : "bg-surface-1 text-muted-foreground")}
            >
              {x.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowTransfers(!showTransfers)}
            className={cn("flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium", showTransfers ? "bg-foreground text-background" : "bg-surface-1 text-muted-foreground")}
          >
            <ArrowLeftRight className="size-3" /> Transfers
          </button>
        </div>
      </div>

      <div className={cn("flex flex-col gap-4 transition-opacity duration-200", loading && "opacity-50")} aria-busy={loading}>
        {shown.upcoming.length > 0 && needle.length < 2 && (
          <section>
            <h2 className="mb-1 px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Upcoming</h2>
            <div className="rounded-2xl border border-dashed border-border px-3">
              {shown.upcoming.slice(0, 3).map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-2.5">
                  <div className={cn("flex min-w-0 flex-1 items-center gap-3", !u.addNow && "opacity-55")}>
                    <CategoryChip icon={u.icon} color={u.color} size="sm" dashed />
                    <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                    <span className={cn("text-xs", u.date < shown.today ? "text-budget-high" : "text-muted-foreground")}>{formatShort(u.date)}</span>
                    <span className="num w-20 text-right text-sm">{formatCents(u.amount_cents)}</span>
                  </div>
                  {u.addNow && <AddBillBadge bill={u} />}
                </div>
              ))}
            </div>
          </section>
        )}

        {days.map(([day, rows]) => (
          <section key={day}>
            <div className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between bg-background/90 px-2 py-1.5 backdrop-blur">
              <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{dayLabel(day)}</span>
              {spentOf(rows) > 0 && <span className="num text-xs text-muted-foreground">−{formatCents(spentOf(rows))}</span>}
            </div>
            <div className="divide-y divide-border rounded-2xl bg-surface-1 px-3">
              {rows.map((r) => (
                <button key={r.id} type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 py-3 text-left">
                  <CategoryChip icon={r.isTransfer ? "arrow-left-right" : r.splits.length ? "circle-dot" : r.category?.icon} color={r.isTransfer ? TRANSFER_HEX : r.category?.color} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{r.isTransfer ? transferTitle(r) : rowTitle(r)}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {r.splits.length > 0 && <Split className="size-3" />}
                      {r.isTransfer ? transferSubtitle(r) : `${rowSubtitle(r)} · ${shortAccount(r.account)}`}
                    </span>
                  </span>
                  <Amount r={r} className="shrink-0 font-medium" />
                </button>
              ))}
            </div>
          </section>
        ))}
        {!days.length && !loading && (
          <p className="py-10 text-center text-sm text-muted-foreground">{searching ? "Searching…" : q || filter !== "all" ? "No transactions match." : `Nothing recorded for ${formatMonth(urlMonth)}.`}</p>
        )}
      </div>

      <TransactionSheet row={open} onClose={() => setOpen(null)} onChanged={refresh} />
    </div>
  );
}

