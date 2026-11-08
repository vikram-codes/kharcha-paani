import { describe, expect, it } from "vitest";
import { easterSunday, nextPayday, ontarioHolidays, paydaysBetween, threePaychequeMonths, type PaySchedule } from "./paydays";

const pay: PaySchedule = { anchor: "2026-11-06", everyDays: 14, rule: "business_day_before" };

describe("holidays", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("lists Ontario stat holidays with observed dates", () => {
    const h = ontarioHolidays(2027);
    for (const d of ["2027-01-01", "2027-02-15", "2027-03-26", "2027-05-24", "2027-07-01", "2027-09-06", "2027-10-11"]) {
      expect(h.has(d), d).toBe(true);
    }
    // Christmas 2027 is a Saturday → observed Mon 27 and Tue 28.
    expect(h.has("2027-12-27")).toBe(true);
    expect(h.has("2027-12-28")).toBe(true);
  });
});

describe("paydays", () => {
  it("repeats every 14 days from the anchor", () => {
    expect(paydaysBetween(pay, "2026-11-01", "2026-12-20").map((p) => p.paid)).toEqual([
      "2026-11-06",
      "2026-11-20",
      "2026-12-04",
      "2026-12-18",
    ]);
  });

  it("moves a holiday payday to the business day before (Jan 1 → Dec 31)", () => {
    const dec = paydaysBetween(pay, "2026-12-01", "2026-12-31");
    expect(dec.map((p) => p.paid)).toEqual(["2026-12-04", "2026-12-18", "2026-12-31"]);
    expect(dec[2].scheduled).toBe("2027-01-01");
  });

  it("moves Good Friday 2027 to Thursday", () => {
    expect(paydaysBetween(pay, "2027-03-20", "2027-03-31").map((p) => p.paid)).toEqual(["2027-03-25"]);
  });

  it("finds the 3-paycheque months the owner expects", () => {
    expect(threePaychequeMonths(pay, "2026-11-01", "2027-12-31")).toEqual(["2026-12", "2027-07", "2027-12"]);
  });

  it("gives the next payday on or after today", () => {
    expect(nextPayday(pay, "2026-11-08").paid).toBe("2026-11-20");
    expect(nextPayday(pay, "2026-11-20").paid).toBe("2026-11-20");
  });
});
