import { describe, expect, it } from "vitest";
import { findRecurring, withBills, type Charge } from "./subscriptions";

const c = (date: string, cents: number, description: string, category = "Apps & streaming"): Charge => ({ date, amount_cents: -cents, description, account: "Scene+ Visa", category, group: "Subscriptions" });
const months = (from: number, n: number, day: number, cents: number, d: string) =>
  Array.from({ length: n }, (_, i) => c(`2026-${String(from + i).padStart(2, "0")}-${String(day).padStart(2, "0")}`, cents, d));

describe("findRecurring", () => {
  it("finds a monthly subscription with its yearly cost", () => {
    const [s] = findRecurring(months(6, 5, 4, 1129, "Disney Plus"), "2026-11-11");
    expect(s).toMatchObject({ merchant: "Disney+", cadence: "monthly", cents: 1129, yearlyCents: 13548, nextDate: "2026-11-04", active: true, priceChange: null });
  });

  it("keeps it when the price goes up, and reports the change", () => {
    const charges = [...months(6, 4, 4, 1129, "Disney Plus"), c("2026-10-04", 1299, "Disney Plus")];
    const [s] = findRecurring(charges, "2026-11-11");
    expect(s.cents).toBe(1299);
    expect(s.priceChange).toEqual({ fromCents: 1129, toCents: 1299, on: "2026-10-04" });
  });

  it("ignores small wobbles like tax or exchange rates", () => {
    const charges = [c("2026-07-02", 3164, "ANTHROPIC"), c("2026-08-02", 3170, "ANTHROPIC"), c("2026-09-02", 3161, "ANTHROPIC"), c("2026-10-02", 3168, "ANTHROPIC")];
    expect(findRecurring(charges, "2026-10-20")[0].priceChange).toBeNull();
  });

  it("skips shops you just visit often", () => {
    const tims = ["2026-09-01", "2026-09-03", "2026-09-10", "2026-09-28", "2026-10-02", "2026-10-30"].map((d, i) => c(d, 200 + i * 37, "TIM HORTONS #1739"));
    const groceries = months(6, 5, 15, 0, "FRESHCO").map((x, i) => ({ ...x, amount_cents: -(4000 + i * 1700) }));
    expect(findRecurring([...tims, ...groceries], "2026-11-11")).toEqual([]);
  });

  it("finds a yearly charge and spreads it per month", () => {
    const [s] = findRecurring([c("2025-03-10", 13900, "Amazon.ca Prime"), c("2026-03-10", 13900, "Amazon.ca Prime")], "2026-11-11");
    expect(s).toMatchObject({ cadence: "yearly", monthlyCents: 1158, nextDate: "2027-03-10", active: true });
  });

  it("marks one that stopped as no longer active", () => {
    const [s] = findRecurring(months(3, 4, 12, 999, "Netflix"), "2026-11-11");
    expect(s.active).toBe(false);
  });
});

describe("withBills", () => {
  const bill = (name: string, cents: number, category: string | null, nextDate = "2026-11-28") => ({ name, cents, category, group: "Subscriptions", account: "Scene+ Visa", nextDate, endDate: null });

  it("marks a found charge as your bill instead of listing it twice", () => {
    const found = findRecurring(months(6, 5, 2, 3164, "ANTHROPIC"), "2026-11-11");
    const all = withBills(found, [bill("Claude", 3164, "Apps & streaming", "2026-12-02")], "2026-11-11");
    expect(all).toHaveLength(1);
    expect(all[0].isBill).toBe(true);
  });

  it("adds a bill that history can't see, rolled to its next date", () => {
    const [s] = withBills([], [bill("Apple Care AirPods Pro", 281, "Apps & streaming", "2026-10-28")], "2026-11-11");
    expect(s).toMatchObject({ merchant: "Apple Care AirPods Pro", cents: 281, yearlyCents: 3372, nextDate: "2026-11-28", isBill: true, lastDate: null });
  });
});
