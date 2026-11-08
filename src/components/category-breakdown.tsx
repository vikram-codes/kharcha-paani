"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Split } from "lucide-react";
import { CategoryChip } from "@/components/category-icon";
import { formatShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export type BreakdownTx = { id: string; date: string; description: string; account: string; amount_cents: number; split: boolean };

export type BreakdownRow = {
  id: string;
  name: string;
  sub?: ReactNode;
  icon: string | null;
  color: string | null;
  /** Main figure (positive cents). */
  cents: number;
  /** Optional right-side extra line (e.g. "+$40 vs last month"). */
  aside?: ReactNode;
  tone?: "in" | "out";
  /** Optional budget bar under the name: share filled (0..1+) and its band color. */
  progress?: { value: number; color: string };
  txs: BreakdownTx[];
};

/** Category rows that expand to show their transactions (§7.10 drill-down). */
export function CategoryBreakdown({ rows, className }: { rows: BreakdownRow[]; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {rows.map((r) => {
        const isOpen = open === r.id;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : r.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <CategoryChip icon={r.icon} color={r.color} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{r.name}</span>
                {r.sub && <span className="truncate text-xs text-muted-foreground">{r.sub}</span>}
                {r.progress && (
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.min(100, r.progress.value * 100)}%`, background: r.progress.color }}
                    />
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end">
                <span className={cn("num text-sm font-medium", r.tone === "in" && "text-money-in")}>
                  {r.tone === "in" ? "+" : ""}
                  {formatCents(r.cents)}
                </span>
                {r.aside}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast)",
                  isOpen && "rotate-180",
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <ul className="mb-3 ml-[52px] flex flex-col gap-0.5 rounded-xl bg-surface-2/60 px-3 py-1.5">
                    {r.txs.length === 0 && <li className="py-2 text-xs text-muted-foreground">No transactions.</li>}
                    {r.txs.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-1.5">
                        <span className="num w-12 shrink-0 text-[11px] text-muted-foreground">{formatShort(t.date)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{t.description || "—"}</span>
                          {t.account && (
                            <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                              {t.split && <Split className="size-3" />}
                              {t.account}
                            </span>
                          )}
                        </span>
                        <span className={cn("num shrink-0 text-[13px]", t.amount_cents > 0 && "text-money-in")}>
                          {formatCents(t.amount_cents, { signed: t.amount_cents > 0 })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
