"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, History } from "lucide-react";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { loadMonthIndex } from "@/app/actions/summary";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function compact(cents: number) {
  const d = cents / 100;
  if (d >= 1000) return `$${(d / 1000).toFixed(d >= 10_000 ? 0 : 1)}k`;
  return `$${Math.round(d)}`;
}

/**
 * The Summary title doubles as a month picker: tap it to see every month as a
 * grid with its spending, and jump straight there.
 */
export function MonthPicker({
  title,
  subtitle,
  selected,
  history,
}: {
  title: string;
  subtitle?: string;
  /** "YYYY-MM", or the history key. */
  selected: string;
  history: { key: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<{ current: string; months: { month: string; spent: number }[] } | null>(null);
  const [loading, startLoading] = useTransition();
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Lazy: month totals are fetched the first time the picker opens.
    if (next && !index) startLoading(async () => setIndex(await loadMonthIndex()));
  };
  const months = index?.months ?? [];
  const current = index?.current ?? "";
  const spent = new Map(months.map((m) => [m.month, m.spent]));
  const years = [...new Set(months.map((m) => m.month.slice(0, 4)))].sort().reverse();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="group flex min-w-0 flex-col items-center rounded-xl px-3 py-1 transition-colors duration-(--duration-fast) hover:bg-surface-1"
            aria-label={`${title}. Choose a month`}
          />
        }
      >
        <span className="flex items-center gap-1">
          <span className="truncate text-lg font-semibold tracking-tight">{title}</span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-(--duration-fast) group-hover:translate-y-0.5" />
        </span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </SheetTrigger>

      <ResponsiveSheetContent>
        <div className="px-5 pt-2 pb-6 md:pt-5">
          <SheetTitle className="text-lg font-semibold">Jump to a month</SheetTitle>
          <SheetDescription className="text-xs">Spending shown under each month.</SheetDescription>

          {(loading || !index) && (
            <div className="mt-5 grid grid-cols-4 gap-2" aria-busy>
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="h-14 animate-pulse rounded-xl bg-surface-1" />
              ))}
            </div>
          )}
          {years.map((y) => (
            <section key={y} className="mt-5">
              <h3 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">{y}</h3>
              <div className="grid grid-cols-4 gap-2">
                {MONTHS.map((label, i) => {
                  const key = `${y}-${String(i + 1).padStart(2, "0")}`;
                  const available = spent.has(key);
                  const isSel = key === selected;
                  const isNow = key === current;
                  if (!available) {
                    return (
                      <span key={key} className="grid h-14 place-items-center rounded-xl text-sm text-muted-foreground/40">
                        {label}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={key}
                      href={`/summary/${key}`}
                      onClick={() => setOpen(false)}
                      aria-current={isSel ? "page" : undefined}
                      className={cn(
                        "relative flex h-14 flex-col items-center justify-center rounded-xl bg-surface-1 transition-colors duration-(--duration-fast) hover:bg-surface-2",
                        isSel && "bg-surface-2 ring-2 ring-lime",
                      )}
                    >
                      <span className="text-sm font-medium">{label}</span>
                      <span className="num text-[11px] text-muted-foreground">{compact(spent.get(key) ?? 0)}</span>
                      {isNow && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-lime" aria-label="This month" />}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <Link
            href={`/summary/${history.key}`}
            onClick={() => setOpen(false)}
            className={cn(
              "mt-5 flex items-center gap-3 rounded-xl bg-surface-1 px-4 py-3 transition-colors duration-(--duration-fast) hover:bg-surface-2",
              selected === history.key && "ring-2 ring-lime",
            )}
          >
            <History className="size-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{history.label}</span>
            <span className="text-xs text-muted-foreground">Money Pro history</span>
          </Link>
        </div>
      </ResponsiveSheetContent>
    </Sheet>
  );
}
