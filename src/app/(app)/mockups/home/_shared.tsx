import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, GraduationCap, type LucideIcon } from "lucide-react";
import { formatCents } from "@/lib/money";
import { bandColorVar, budgetBand } from "@/lib/budget";

/**
 * Mockup data. Balances are the real seeded ones; the "left to spend" numbers
 * are illustrative until budgets exist (phase 5).
 */
export const mock = {
  month: "November",
  cash: 110_000,
  debts: 12_594 + 30_000 + 273_000 + 567_000 + 4_852_941,
  investments: 0,
  pool: 186_000,
  spent: 112_000,
  daysLeft: 22,
  nextPayday: "Fri, Nov 20",
  upcoming: [
    { name: "Student loan", sub: "Remitly · chequing", date: "Nov 10", inDays: 2, amount: 55_000, icon: GraduationCap },
    { name: "Affirm", sub: "Final payment", date: "Nov 16", inDays: 8, amount: 2_490, icon: CalendarClock },
    { name: "Affirm", sub: "Final payment", date: "Nov 20", inDays: 12, amount: 10_104, icon: CalendarClock },
  ] satisfies { name: string; sub: string; date: string; inDays: number; amount: number; icon: LucideIcon }[],
};

export const left = mock.pool - mock.spent;
export const band = budgetBand(mock.spent, mock.pool);
export const bandColor = bandColorVar[band];
export const usedPct = Math.round((mock.spent / mock.pool) * 100);

export const money = (c: number, whole = true) => formatCents(c, { whole });

/** Rounded-cap donut. `value` is 0..1 of the ring that's filled. */
export function Donut({
  value,
  size = 168,
  stroke = 14,
  color,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0.001, Math.min(1, value))} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Greyed "not real yet" upcoming bill row (§6). */
export function UpcomingRow({ item }: { item: (typeof mock.upcoming)[number] }) {
  const Icon = item.icon;
  return (
    <div className="flex items-center gap-3 py-2.5 opacity-55">
      <span className="grid size-9 place-items-center rounded-xl border border-dashed border-border">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{item.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {item.date} · {item.sub}
        </span>
      </span>
      <span className="num text-sm">−{money(item.amount, false)}</span>
    </div>
  );
}

export function MockupSwitcher({ current }: { current: "a" | "b" | "c" }) {
  return (
    <div className="mb-5 flex items-center gap-1 rounded-full bg-surface-1 p-1 text-xs font-medium">
      {(["a", "b", "c"] as const).map((v) => (
        <Link
          key={v}
          href={`/mockups/home/${v}`}
          className={
            v === current
              ? "flex-1 rounded-full bg-lime py-1.5 text-center text-on-lime"
              : "flex-1 rounded-full py-1.5 text-center text-muted-foreground"
          }
        >
          {v.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
