import { describe, expect, it } from "vitest";
import { billDates, cashForecast, type BillForecastInput } from "./forecast";

const monthly = (name: string, nextDate: string, cents: number, open = nextDate): BillForecastInput => ({ name, cadence: "monthly", nextDate, open, endDate: null, cents });
const once = (name: string, date: string, cents: number): BillForecastInput => ({ name, cadence: "once", nextDate: date, open: date, endDate: null, cents });

describe("billDates", () => {
  it("repeats a monthly bill from its open occurrence", () => {
    expect(billDates(monthly("Remitly", "2026-10-10", -55000, "2026-12-10"), "2027-01-31")).toEqual(["2026-12-10", "2027-01-10"]);
  });

  it("keeps a month-end bill at the end of short months", () => {
    expect(billDates(monthly("X", "2026-10-31", -100, "2026-11-30"), "2027-03-01")).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("stops at the end date, and a one-off happens once", () => {
    expect(billDates({ ...monthly("Affirm", "2026-11-30", -4914), endDate: "2026-12-30" }, "2027-03-01")).toEqual(["2026-11-30", "2026-12-30"]);
    expect(billDates(once("Affirm", "2026-11-16", -2490), "2027-01-01")).toEqual(["2026-11-16"]);
  });
});

describe("cashForecast", () => {
  // Nov 11 2026: chequing $877.47, paid $2,068 on Nov 20 and Dec 4.
  const f = cashForecast({
    today: "2026-11-11",
    start: 87747,
    payCents: 206800,
    paydays: ["2026-11-20", "2026-12-04"],
    bills: [
      once("Affirm", "2026-11-16", -2490),
      once("Affirm", "2026-11-20", -10104),
      monthly("Affirm walk pad", "2026-11-30", -4914),
      monthly("Rent", "2026-12-01", -70000),
      monthly("Remitly", "2026-10-10", -55000, "2026-12-10"),
    ],
  });

  it("finds the low point before each payday", () => {
    expect(f.periods).toHaveLength(2);
    // Before Nov 20: both Affirms, the second on payday itself (bills go out first).
    expect(f.periods[0].low).toEqual({ cents: 87747 - 2490 - 10104, date: "2026-11-20" });
    expect(f.periods[0].bills.map((b) => b.date)).toEqual(["2026-11-16", "2026-11-20"]);
    // Nov 20 → Dec 4: walk pad and rent come out; Remitly (Dec 10) is after.
    const afterPay = 87747 - 2490 - 10104 + 206800;
    expect(f.periods[1].low).toEqual({ cents: afterPay - 4914 - 70000, date: "2026-12-01" });
    expect(f.periods[1].bills.map((b) => b.label)).toEqual(["Affirm walk pad", "Rent"]);
  });

  it("counts an overdue unrecorded bill as going out today", () => {
    const g = cashForecast({ today: "2026-11-11", start: 10000, payCents: 0, paydays: ["2026-11-20"], bills: [once("Late", "2026-11-09", -3000)] });
    expect(g.periods[0].low).toEqual({ cents: 7000, date: "2026-11-11" });
  });

  it("shows when a bill would take chequing below zero", () => {
    const g = cashForecast({ today: "2026-11-25", start: 50000, payCents: 206800, paydays: ["2026-12-04"], bills: [monthly("Rent", "2026-12-01", -70000)] });
    expect(g.periods[0].low).toEqual({ cents: -20000, date: "2026-12-01" });
  });

  it("keeps one balance per day, at the end of the day", () => {
    const day = f.days.find((d) => d.date === "2026-11-20")!;
    expect(day.cents).toBe(87747 - 2490 - 10104 + 206800);
    expect(f.days[0]).toEqual({ date: "2026-11-11", cents: 87747 });
  });
});
