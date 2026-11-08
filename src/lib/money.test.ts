import { describe, expect, it } from "vitest";
import { allocateCents, formatCents, parseToCents, sumCents } from "./money";
import { budgetBand, crossedThresholds } from "./budget";

describe("parseToCents", () => {
  it.each([
    ["1,234.56", 123456],
    ["$12", 1200],
    ["12.5", 1250],
    ["-3.07", -307],
    ["(45.00)", -4500],
    ["0.10", 10],
    ["−279.58", -27958],
  ])("%s -> %i", (input, cents) => {
    expect(parseToCents(input)).toBe(cents);
  });

  it("avoids float drift (0.1 + 0.2 problem)", () => {
    expect(parseToCents("0.1") + parseToCents("0.2")).toBe(30);
  });

  it.each(["12.345", "abc", "", "1.2.3"])("rejects %j", (bad) => {
    expect(() => parseToCents(bad)).toThrow();
  });
});

describe("formatCents", () => {
  it("formats CAD with true minus sign", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-27958)).toBe("−$279.58");
    expect(formatCents(206800, { whole: true })).toBe("$2,068");
    expect(formatCents(500, { signed: true })).toBe("+$5.00");
  });
  it("rejects non-integer cents", () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});

describe("allocateCents", () => {
  it("friend owes 50% of an odd amount — parts add up exactly", () => {
    const parts = allocateCents(-5001, [1, 1]);
    expect(sumCents(parts)).toBe(-5001);
    expect(parts.map(Math.abs).sort()).toEqual([2500, 2501]);
  });
  it("Costco $100 split 80/20", () => {
    expect(allocateCents(-10000, [80, 20])).toEqual([-8000, -2000]);
  });
  it("three-way split of $10", () => {
    const parts = allocateCents(1000, [1, 1, 1]);
    expect(sumCents(parts)).toBe(1000);
  });
});

describe("budgetBand (§7.3)", () => {
  const budget = 10000; // $100
  it.each([
    [0, "ok"],
    [4999, "ok"],
    [5000, "warn"],
    [7999, "warn"],
    [8000, "high"],
    [9999, "high"],
    [10000, "over"],
    [25000, "over"],
  ] as const)("spent %i of $100 -> %s", (spent, band) => {
    expect(budgetBand(spent, budget)).toBe(band);
  });

  it("notifies once at 80% and 100%", () => {
    expect(crossedThresholds(7000, 8500, budget)).toEqual([80]);
    expect(crossedThresholds(8500, 9000, budget)).toEqual([]);
    expect(crossedThresholds(7000, 10500, budget)).toEqual([80, 100]);
  });
});
