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
