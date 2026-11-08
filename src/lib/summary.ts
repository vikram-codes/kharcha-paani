import type { Cents } from "./money";

export type CategoryInfo = {
  id: string;
  key: string;
  name: string;
  parentName: string | null;
  kind: "expense" | "income" | "transfer" | "reimbursement" | "adjustment";
  essential: "fixed" | "variable" | null;
  color: string | null;
  icon: string | null;
};

export type TxRow = {
  amount_cents: Cents;
  is_transfer: boolean;
  in_reports: boolean;
  category: CategoryInfo | null;
};

export type CategoryTotal = { category: CategoryInfo | null; cents: Cents; count: number };

export type MonthSummary = {
  income: Cents;
  spent: Cents;
  net: Cents;
  fixed: Cents;
  variable: Cents;
  discretionary: Cents;
  /** Spending by category, largest first (positive = spent). */
  expenses: CategoryTotal[];
  /** Income by category, largest first. */
  incomes: CategoryTotal[];
  /** Balance adjustments (signed; neither income nor spending). */
  adjustments: Cents;
};

/**
 * Month totals per the accounting rules (§3.4): transfers and friend paybacks
 * are neither income nor spending; refunds (positive rows in an expense
 * category) reduce that category; card purchases count when made.
 */
export function summarize(rows: readonly TxRow[]): MonthSummary {
  const exp = new Map<string, CategoryTotal>();
  const inc = new Map<string, CategoryTotal>();
  let income = 0;
  let spent = 0;
  let fixed = 0;
  let variable = 0;
  let adjustments = 0;

  for (const r of rows) {
    if (!r.in_reports || r.is_transfer) continue;
    const kind = r.category?.kind ?? (r.amount_cents > 0 ? "income" : "expense");
    if (kind === "transfer" || kind === "reimbursement") continue;
    if (kind === "adjustment") {
      adjustments += r.amount_cents;
      continue;
    }
    const key = r.category?.id ?? "__none";

    if (kind === "income") {
      income += r.amount_cents;
      bump(inc, key, r.category, r.amount_cents);
    } else {
      const s = -r.amount_cents;
      spent += s;
      if (r.category?.essential === "fixed") fixed += s;
      else if (r.category?.essential === "variable") variable += s;
      bump(exp, key, r.category, s);
    }
  }

  const sort = (m: Map<string, CategoryTotal>) => [...m.values()].filter((c) => c.cents !== 0).sort((a, b) => b.cents - a.cents);
  return {
    income,
    spent,
    net: income - spent,
    fixed,
    variable,
    discretionary: spent - fixed - variable,
    expenses: sort(exp),
    incomes: sort(inc),
    adjustments,
  };
}

function bump(m: Map<string, CategoryTotal>, key: string, category: CategoryInfo | null, cents: Cents) {
  const cur = m.get(key) ?? { category, cents: 0, count: 0 };
  cur.cents += cents;
  cur.count += 1;
  m.set(key, cur);
}
