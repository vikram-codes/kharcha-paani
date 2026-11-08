import type { Cents } from "./money";

/** §7.3 budget bands: <50% ok, 50–<80% warn, 80–<100% high, >=100% over. */
export type BudgetBand = "ok" | "warn" | "high" | "over";

export function budgetBand(spent: Cents, budget: Cents): BudgetBand {
  if (budget <= 0) return spent > 0 ? "over" : "ok";
  // Compare in integer space to avoid float edge cases at exactly 50/80/100%.
  const s = Math.max(0, spent) * 100;
  if (s >= budget * 100) return "over";
  if (s >= budget * 80) return "high";
  if (s >= budget * 50) return "warn";
  return "ok";
}

/** Tailwind token per band, so every bar/donut/chip uses the same colors. */
export const bandColorVar: Record<BudgetBand, string> = {
  ok: "var(--budget-ok)",
  warn: "var(--budget-warn)",
  high: "var(--budget-high)",
  over: "var(--budget-over)",
};

/** Push-notification thresholds (§7.12): fire once when crossing 80% and 100%. */
export function crossedThresholds(before: Cents, after: Cents, budget: Cents): (80 | 100)[] {
  if (budget <= 0) return [];
  const out: (80 | 100)[] = [];
  for (const t of [80, 100] as const) {
    if (before * 100 < budget * t && after * 100 >= budget * t) out.push(t);
  }
  return out;
}

export type BudgetLineDef = {
  id: string;
  key: string;
  name: string;
  kind: "fixed" | "variable";
  icon: string | null;
  color: string | null;
  /** This month's budget (override, else the line's default). */
  budget: Cents;
  categoryIds: string[];
};

export type BudgetLineStatus = BudgetLineDef & { spent: Cents; band: BudgetBand; pct: number; paid: boolean };

/**
 * Budget vs actual per line (§7.7). `spentByCategory` is positive spending per
 * category id (refunds already netted). Spending in categories that belong to
 * no line is reported as `unbudgeted`.
 */
export function budgetStatus(lines: readonly BudgetLineDef[], spentByCategory: ReadonlyMap<string, Cents>) {
  const covered = new Set<string>();
  const out: BudgetLineStatus[] = lines.map((l) => {
    let spent = 0;
    for (const c of l.categoryIds) {
      covered.add(c);
      spent += spentByCategory.get(c) ?? 0;
    }
    // A fixed bill paid in full is expected, not a warning: it only turns red when it costs MORE than planned.
    const band = l.kind === "fixed" ? (spent > l.budget ? "over" : "ok") : budgetBand(spent, l.budget);
    const paid = l.kind === "fixed" && l.budget > 0 && spent >= l.budget;
    return { ...l, spent, band, paid, pct: l.budget > 0 ? Math.round((spent / l.budget) * 100) : 0 };
  });
  let unbudgeted = 0;
  for (const [c, cents] of spentByCategory) if (!covered.has(c)) unbudgeted += cents;
  const sum = (k: "fixed" | "variable", f: "budget" | "spent") =>
    out.filter((l) => l.kind === k).reduce((t, l) => t + l[f], 0);
  const budget = out.reduce((t, l) => t + l.budget, 0);
  const spent = out.reduce((t, l) => t + l.spent, 0) + unbudgeted;
  return {
    lines: out,
    fixed: { budget: sum("fixed", "budget"), spent: sum("fixed", "spent") },
    variable: { budget: sum("variable", "budget"), spent: sum("variable", "spent") },
    unbudgeted,
    budget,
    spent,
    band: budgetBand(spent, budget),
  };
}
