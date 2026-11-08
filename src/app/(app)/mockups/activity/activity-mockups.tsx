"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Search, Split } from "lucide-react";
import { CategoryChip } from "@/components/category-icon";
import { formatDay, formatShort, toDate } from "@/lib/dates";
import { cleanMerchant } from "@/lib/merchant";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ActivityRow, Upcoming } from "@/lib/data";

type Props = { rows: ActivityRow[]; upcoming: Upcoming[]; monthLabel: string };

// ───────────────────────────── shared ─────────────────────────────

const ACCOUNT_SHORT: [RegExp, string][] = [
  [/chequing/i, "Chequing"],
  [/savings/i, "Savings"],
  [/scene/i, "Scene+ Visa"],
  [/cibc|costco/i, "CIBC"],
  [/triangle/i, "Triangle"],
  [/cashew/i, "Cashew"],
  [/money pro/i, "Money Pro"],
];
const shortAccount = (name: string) => ACCOUNT_SHORT.find(([re]) => re.test(name))?.[1] ?? name;
const CODE: Record<string, string> = { Chequing: "CHQ", Savings: "SAV", "Scene+ Visa": "VISA", CIBC: "CIBC", Triangle: "TRI" };

const title = (r: ActivityRow) => (r.note && r.source === "manual" ? r.note : cleanMerchant(r.description) || r.category?.name || "—");
const subtitle = (r: ActivityRow) =>
  r.splits.length ? `Split · ${r.splits.map((s) => s.name).join(" + ")}` : r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized");
/** Day total = spending only (money out, not transfers). */
const spentOf = (rows: ActivityRow[]) => rows.filter((r) => !r.isTransfer && r.amount_cents < 0).reduce((t, r) => t - r.amount_cents, 0);

type Filter = "all" | "cards" | "chequing" | "in";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cards", label: "Cards" },
  { key: "chequing", label: "Chequing" },
  { key: "in", label: "Money in" },
];

function useFiltered(rows: ActivityRow[]) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showTransfers, setShowTransfers] = useState(false);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showTransfers && r.isTransfer) return false;
      if (filter === "cards" && r.accountGroup !== "debt_card") return false;
      if (filter === "chequing" && !/chequing/i.test(r.account)) return false;
      if (filter === "in" && r.amount_cents <= 0) return false;
      if (!needle) return true;
      return [r.description, r.note ?? "", r.category?.name ?? "", r.account].some((s) => s.toLowerCase().includes(needle));
    });
  }, [rows, q, filter, showTransfers]);
  const days = useMemo(() => {
    const m = new Map<string, ActivityRow[]>();
    for (const r of list) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()];
  }, [list]);
  return { q, setQ, filter, setFilter, showTransfers, setShowTransfers, list, days };
}

function SearchBar({ f, className }: { f: ReturnType<typeof useFiltered>; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label className="flex h-11 items-center gap-2 rounded-xl bg-surface-1 px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-lime">
        <Search className="size-4 text-muted-foreground" />
        <input value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder="Search merchant, category, note" className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
      </label>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTERS.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => f.setFilter(x.key)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium", f.filter === x.key ? "bg-foreground text-background" : "bg-surface-1 text-muted-foreground")}
          >
            {x.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => f.setShowTransfers(!f.showTransfers)}
          className={cn("flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium", f.showTransfers ? "bg-foreground text-background" : "bg-surface-1 text-muted-foreground")}
        >
          <ArrowLeftRight className="size-3" /> Transfers
        </button>
      </div>
    </div>
  );
}

function Amount({ r, className }: { r: ActivityRow; className?: string }) {
  return (
    <span className={cn("num shrink-0", r.amount_cents > 0 && !r.isTransfer && "text-money-in", r.isTransfer && "text-muted-foreground", className)}>
      {formatCents(r.amount_cents, { signed: r.amount_cents > 0 })}
    </span>
  );
}

function UpcomingRows({ upcoming, compact }: { upcoming: Upcoming[]; compact?: boolean }) {
  if (!upcoming.length) return null;
  return (
    <section>
      <h2 className="mb-1 px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Upcoming</h2>
      <div className="rounded-2xl border border-dashed border-border px-3">
        {upcoming.slice(0, 3).map((u) => (
          <div key={u.id} className={cn("flex items-center gap-3 opacity-55", compact ? "py-2" : "py-2.5")}>
            <CategoryChip icon={u.icon} color={u.color} size="sm" dashed />
            <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
            <span className="text-xs text-muted-foreground">{formatShort(u.date)}</span>
            <span className="num w-20 text-right text-sm">{formatCents(u.amount_cents)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MockupSwitch({ current }: { current: "a" | "b" | "c" }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface-1 p-1 text-xs font-medium">
      {(["a", "b", "c"] as const).map((v) => (
        <Link key={v} href={`/mockups/activity/${v}`} className={cn("flex-1 rounded-full py-1.5 text-center", v === current ? "bg-lime text-on-lime" : "text-muted-foreground")}>
          {v === "a" ? "A · Grouped" : v === "b" ? "B · Ledger" : "C · Day cards"}
        </Link>
      ))}
    </div>
  );
}

// ───────────────────────────── A: grouped by day ─────────────────────────────

export function MockupA({ rows, upcoming, monthLabel }: Props) {
  const f = useFiltered(rows);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-semibold tracking-tight">{monthLabel}</h1>
      <SearchBar f={f} />
      <UpcomingRows upcoming={upcoming} />
      {f.days.map(([day, list]) => (
        <section key={day}>
          <div className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between bg-background/90 px-2 py-1.5 backdrop-blur">
            <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{formatDay(day)}</span>
            {spentOf(list) > 0 && <span className="num text-xs text-muted-foreground">−{formatCents(spentOf(list))}</span>}
          </div>
          <div className="divide-y divide-border rounded-2xl bg-surface-1 px-3">
            {list.map((r) => (
              <div key={r.id} className={cn("flex items-center gap-3 py-3", r.isTransfer && "opacity-60")}>
                <CategoryChip icon={r.isTransfer ? "arrow-left-right" : r.splits.length ? "circle-dot" : r.category?.icon} color={r.category?.color} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{title(r)}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {r.splits.length > 0 && <Split className="size-3" />}
                    {subtitle(r)} · {shortAccount(r.account)}
                  </span>
                </span>
                <Amount r={r} className="text-sm font-medium" />
              </div>
            ))}
          </div>
        </section>
      ))}
      {!f.days.length && <p className="py-10 text-center text-sm text-muted-foreground">No transactions match.</p>}
    </div>
  );
}

// ───────────────────────────── B: dense ledger ─────────────────────────────

export function MockupB({ rows, upcoming, monthLabel }: Props) {
  const f = useFiltered(rows);
  const out = spentOf(f.list);
  const inn = f.list.filter((r) => !r.isTransfer && r.amount_cents > 0).reduce((t, r) => t + r.amount_cents, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 pt-1 pb-2 backdrop-blur">
        <div className="flex items-end justify-between">
          <h1 className="text-xl font-semibold tracking-tight">{monthLabel}</h1>
          <div className="num flex gap-3 text-xs">
            <span className="text-money-in">+{formatCents(inn, { whole: true })}</span>
            <span>−{formatCents(out, { whole: true })}</span>
            <span className="text-muted-foreground">{f.list.length} items</span>
          </div>
        </div>
        <SearchBar f={f} className="mt-2" />
      </div>
      <UpcomingRows upcoming={upcoming} compact />
      <div className="overflow-hidden rounded-2xl bg-surface-1">
        {f.list.map((r, i) => {
          const newDay = i === 0 || f.list[i - 1].date !== r.date;
          return (
            <div key={r.id} className={cn("grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-3 px-3 py-2", newDay && i > 0 && "border-t border-border", r.isTransfer && "opacity-60")}>
              <span className="num text-[11px] leading-tight text-muted-foreground">
                {newDay ? (
                  <>
                    <span className="block text-sm font-semibold text-foreground">{toDate(r.date).getUTCDate()}</span>
                    {new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" }).format(toDate(r.date))}
                  </>
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{title(r)}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                  <span className="truncate rounded-full px-1.5 py-px" style={{ background: `${r.category?.color ?? "#718096"}22`, color: r.category?.color ?? undefined }}>
                    {r.splits.length ? "Split" : r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized")}
                  </span>
                  <span className="num text-muted-foreground">{CODE[shortAccount(r.account)] ?? shortAccount(r.account)}</span>
                </span>
              </span>
              <Amount r={r} className="text-[13px] font-medium" />
            </div>
          );
        })}
        {!f.list.length && <p className="py-10 text-center text-sm text-muted-foreground">No transactions match.</p>}
      </div>
    </div>
  );
}

// ───────────────────────────── C: day cards ─────────────────────────────

export function MockupC({ rows, upcoming, monthLabel }: Props) {
  const f = useFiltered(rows);
  const dailyAvg = f.days.length ? spentOf(f.list) / f.days.length : 0;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-semibold tracking-tight">{monthLabel}</h1>
      <SearchBar f={f} />
      <UpcomingRows upcoming={upcoming} />
      {f.days.map(([day, list]) => {
        const spent = spentOf(list);
        const d = toDate(day);
        return (
          <section key={day} className="rounded-3xl bg-surface-1 p-4">
            <header className="mb-2 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-center leading-none">
                <span>
                  <span className="num block text-base font-semibold">{d.getUTCDate()}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" }).format(d)}</span>
                </span>
              </span>
              <span className="flex-1">
                <span className="num block text-sm font-semibold">{spent ? `−${formatCents(spent)}` : "No spending"}</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.min(100, dailyAvg ? (spent / (dailyAvg * 2)) * 100 : 0)}%`, background: spent > dailyAvg * 1.5 ? "var(--budget-high)" : "var(--lime)" }}
                  />
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{list.length} {list.length === 1 ? "item" : "items"}</span>
            </header>
            <div className="flex flex-col">
              {list.map((r) => (
                <div key={r.id} className={cn("flex items-center gap-3 py-2", r.isTransfer && "opacity-60")}>
                  <CategoryChip icon={r.isTransfer ? "arrow-left-right" : r.category?.icon} color={r.category?.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{title(r)}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{shortAccount(r.account)}</span>
                  <Amount r={r} className="text-sm" />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {!f.days.length && <p className="py-10 text-center text-sm text-muted-foreground">No transactions match.</p>}
    </div>
  );
}
