import { describe, expect, it } from "vitest";
import { detectRecurring } from "./recurring";
import { monthEndPrompt, thirdPaychequePrompt } from "./savings-prompts";

const row = (date: string, amount_cents: number, description: string) => ({ date, amount_cents, description, account_id: "tri", category_id: "c" });

describe("detectRecurring", () => {
  it("finds a monthly charge with a stable amount", () => {
    const s = detectRecurring([
      row("2026-08-18", -3164, "ANTHROPIC* CLAUDE SUB SAN"),
      row("2026-09-18", -3164, "ANTHROPIC* CLAUDE SUB SAN"),
      row("2026-10-18", -3164, "ANTHROPIC* CLAUDE SUB"),
      row("2026-09-05", -1200, "TIM HORTONS #1 LONDON ON"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ merchant: "Claude", amount_cents: -3164, next_date: "2026-11-18", occurrences: 3 });
  });

  it("ignores frequent irregular spending (coffee) and one-offs", () => {
    const s = detectRecurring([
      row("2026-09-01", -500, "TIM HORTONS #1"),
      row("2026-09-04", -700, "TIM HORTONS #1"),
      row("2026-09-09", -450, "TIM HORTONS #1"),
      row("2026-10-02", -650, "TIM HORTONS #1"),
    ]);
    expect(s).toHaveLength(0);
  });

  it("tolerates small price changes and snaps the next date to month length", () => {
    const s = detectRecurring([
      row("2026-08-31", -2000, "GYM"),
      row("2026-09-30", -2050, "GYM"),
      row("2026-10-31", -2100, "GYM"),
    ]);
    expect(s[0].next_date).toBe("2026-11-30");
  });
});

describe("savings prompts", () => {
  const pay = { anchor: "2026-11-06", everyDays: 14, rule: "business_day_before" as const };

  it("offers the 3rd December paycheque from Dec 31 to Jan 5", () => {
    expect(thirdPaychequePrompt(pay, 206_800, "2026-12-30")).toBeNull();
    expect(thirdPaychequePrompt(pay, 206_800, "2026-12-31")).toMatchObject({ key: "third-pay:2026-12", amount_cents: 206_800, payday: "2026-12-31" });
    expect(thirdPaychequePrompt(pay, 206_800, "2027-01-05")?.key).toBe("third-pay:2026-12");
    expect(thirdPaychequePrompt(pay, 206_800, "2027-01-06")).toBeNull();
    expect(thirdPaychequePrompt(pay, 206_800, "2026-11-20")).toBeNull(); // November has 2
  });

  it("offers the month-end leftover only when under budget, near month end", () => {
    expect(monthEndPrompt("2026-11", 250_000, 300_000, "2026-11-27")).toBeNull();
    expect(monthEndPrompt("2026-11", 250_000, 300_000, "2026-11-28")).toMatchObject({ key: "month-end:2026-11", amount_cents: 50_000 });
    expect(monthEndPrompt("2026-11", 250_000, 300_000, "2026-12-05")).not.toBeNull();
    expect(monthEndPrompt("2026-11", 250_000, 300_000, "2026-12-06")).toBeNull();
    expect(monthEndPrompt("2026-11", 310_000, 300_000, "2026-11-30")).toBeNull();
  });
});
