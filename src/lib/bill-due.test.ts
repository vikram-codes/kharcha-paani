import { describe, expect, it } from "vitest";
import { isRecorded, needsAdding, openOccurrence, type BillSchedule, type LedgerHit } from "./bill-due";

const remitly: BillSchedule = { cadence: "monthly", next_date: "2026-10-10", end_date: null, amount_cents: -55000, category_id: "loan", account_id: "chq" };
const hit = (date: string, cents: number, categoryId = "loan", accountId = "visa"): LedgerHit => ({ date, cents, categoryId, accountId });

describe("openOccurrence", () => {
  it("rolls a monthly bill forward to the current cycle", () => {
    expect(openOccurrence(remitly, "2026-11-08", [])).toBe("2026-11-10");
  });

  it("keeps an unrecorded bill up to 3 days overdue, then moves on", () => {
    expect(openOccurrence(remitly, "2026-11-12", [])).toBe("2026-11-10");
    expect(openOccurrence(remitly, "2026-11-14", [])).toBe("2026-12-10");
  });

  it("moves past a cycle once it's recorded (a split counts by its own amount)", () => {
    expect(openOccurrence(remitly, "2026-11-10", [hit("2026-11-10", -51000)])).toBe("2026-12-10");
  });

  it("drops a one-off bill once paid or long past", () => {
    const affirm: BillSchedule = { cadence: "once", next_date: "2026-11-16", end_date: null, amount_cents: -2490, category_id: "affirm", account_id: "chq" };
    expect(openOccurrence(affirm, "2026-11-15", [hit("2026-11-15", -2490, "affirm")])).toBeNull();
    expect(openOccurrence(affirm, "2026-11-15", [])).toBe("2026-11-16");
    expect(openOccurrence(affirm, "2026-11-20", [])).toBeNull();
  });
});

describe("isRecorded", () => {
  it("needs the same category, direction and a close amount and date", () => {
    expect(isRecorded(remitly, "2026-11-10", [hit("2026-11-10", -55000, "rent")])).toBe(false);
    expect(isRecorded(remitly, "2026-11-10", [hit("2026-11-10", 55000)])).toBe(false);
    expect(isRecorded(remitly, "2026-11-10", [hit("2026-11-10", -30000)])).toBe(false);
    expect(isRecorded(remitly, "2026-11-10", [hit("2026-11-20", -55000)])).toBe(false);
    expect(isRecorded(remitly, "2026-11-10", [hit("2026-11-07", -55000)])).toBe(true);
  });

  it("also counts an entry from the bill's account filed under another category", () => {
    expect(isRecorded(remitly, "2026-11-10", [hit("2026-11-10", -55000, "send_home", "chq")])).toBe(true);
    expect(isRecorded(remitly, "2026-11-10", [hit("2026-11-10", -30000, "send_home", "chq")])).toBe(false);
  });
});

describe("needsAdding", () => {
  it("is true from tomorrow back through overdue", () => {
    expect(needsAdding("2026-11-11", "2026-11-10")).toBe(true);
    expect(needsAdding("2026-11-10", "2026-11-10")).toBe(true);
    expect(needsAdding("2026-11-08", "2026-11-10")).toBe(true);
    expect(needsAdding("2026-11-12", "2026-11-10")).toBe(false);
  });
});
