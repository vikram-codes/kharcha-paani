import { describe, expect, it } from "vitest";
import { summarize, type CategoryInfo, type TxRow } from "./summary";

const cat = (key: string, kind: CategoryInfo["kind"], essential: CategoryInfo["essential"] = null): CategoryInfo => ({
  id: key, key, name: key, parentName: null, kind, essential, color: null, icon: null,
});
const groceries = cat("groceries", "expense", "variable");
const rent = cat("rent", "expense", "fixed");
const eating = cat("eating_out", "expense");
const salary = cat("salary", "income");
const ccPay = cat("cc_payment", "transfer");
const payback = cat("friend_payback", "reimbursement");

const row = (amount_cents: number, category: CategoryInfo | null, extra: Partial<TxRow> = {}): TxRow => ({
  amount_cents, category, is_transfer: false, in_reports: true, ...extra,
});

describe("summarize", () => {
  it("splits income, essentials and discretionary", () => {
    const s = summarize([
      row(206_800, salary),
      row(206_800, salary),
      row(-70_000, rent),
      row(-12_000, groceries),
      row(-5_000, eating),
    ]);
    expect(s.income).toBe(413_600);
    expect(s.spent).toBe(87_000);
    expect(s.fixed).toBe(70_000);
    expect(s.variable).toBe(12_000);
    expect(s.discretionary).toBe(5_000);
    expect(s.net).toBe(326_600);
    expect(s.expenses.map((e) => e.category?.key)).toEqual(["rent", "groceries", "eating_out"]);
  });

  it("ignores transfers, card payments, friend paybacks and balance-only rows", () => {
    const s = summarize([
      row(-50_000, ccPay),
      row(-20_000, null, { is_transfer: true }),
      row(2_500, payback),
      row(-9_999, eating, { in_reports: false }),
    ]);
    expect(s.spent).toBe(0);
    expect(s.income).toBe(0);
  });

  it("keeps balance adjustments out of income and spending", () => {
    const adj = cat("adjustment", "adjustment");
    const s = summarize([row(231_000, adj), row(-170_000, adj), row(-5_000, eating)]);
    expect(s.income).toBe(0);
    expect(s.spent).toBe(5_000);
    expect(s.adjustments).toBe(61_000);
  });

  it("refunds reduce their category", () => {
    const s = summarize([row(-10_000, eating), row(3_000, eating)]);
    expect(s.spent).toBe(7_000);
    expect(s.expenses[0].cents).toBe(7_000);
  });

  it("treats uncategorized money out as spending and money in as income", () => {
    const s = summarize([row(-4_000, null), row(1_000, null)]);
    expect(s.spent).toBe(4_000);
    expect(s.income).toBe(1_000);
  });
});
