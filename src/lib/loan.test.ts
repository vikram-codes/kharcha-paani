import { describe, expect, it } from "vitest";
import { loanState, monthlyInterest, payoffMonth } from "./loan";

const base = { anchorOwed: 4_852_941, anchorDate: "2026-11-07", aprPct: 9.5 };

describe("student loan", () => {
  it("monthly interest at 9.5% on $48,529.41 is $384.19", () => {
    expect(monthlyInterest(4_852_941, 9.5)).toBe(38_419);
  });

  it("before any payment or month end, owes the anchor", () => {
    const s = loanState({ ...base, payments: [], today: "2026-11-08" });
    expect(s.owed).toBe(4_852_941);
    expect(s.interestSinceAnchor).toBe(0);
    expect(s.nextInterestDate).toBe("2026-12-01");
  });

  it("applies the Nov 10 payment, then Dec 1 interest on the lower balance", () => {
    const s = loanState({ ...base, payments: [{ date: "2026-11-10", cents: 55_000 }], today: "2026-12-05" });
    const afterPay = 4_852_941 - 55_000;
    const i = monthlyInterest(afterPay, 9.5);
    expect(s.interestSinceAnchor).toBe(i);
    expect(s.owed).toBe(afterPay + i);
  });

  it("ignores payments on or before the anchor (already in the balance)", () => {
    const s = loanState({ ...base, payments: [{ date: "2026-10-22", cents: 50_000 }], today: "2026-11-08" });
    expect(s.owed).toBe(4_852_941);
  });

  it("projects payoff around 12–13 years at $550/month", () => {
    const m = payoffMonth(4_852_941, 9.5, 55_000, "2026-11-08");
    expect(m).not.toBeNull();
    expect(Number(m!.slice(0, 4))).toBeGreaterThanOrEqual(2038);
    expect(Number(m!.slice(0, 4))).toBeLessThanOrEqual(2040);
  });

  it("returns null when the payment doesn't cover interest", () => {
    expect(payoffMonth(4_852_941, 9.5, 30_000, "2026-11-08")).toBeNull();
  });
});
