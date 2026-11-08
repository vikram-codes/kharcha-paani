import { describe, expect, it } from "vitest";
import { budgetStatus, type BudgetLineDef } from "./budget";

const line = (key: string, kind: "fixed" | "variable", budget: number, categoryIds: string[]): BudgetLineDef => ({
  id: key, key, name: key, kind, icon: null, color: null, budget, categoryIds,
});

describe("budgetStatus", () => {
  const lines = [
    line("rent", "fixed", 70_000, ["rent"]),
    line("eating", "variable", 30_000, ["eating_out", "misc"]),
    line("fun", "variable", 20_000, ["entertainment"]),
  ];

  it("sums categories into their line and bands each line", () => {
    const s = budgetStatus(lines, new Map([["rent", 70_000], ["eating_out", 20_000], ["misc", 5_000]]));
    const byKey = Object.fromEntries(s.lines.map((l) => [l.key, l]));
    expect(byKey.rent.spent).toBe(70_000);
    expect(byKey.rent.band).toBe("ok"); // a fixed bill paid exactly as planned isn't a warning
    expect(byKey.rent.paid).toBe(true);
    expect(byKey.eating.spent).toBe(25_000);
    expect(byKey.eating.band).toBe("high");
    expect(byKey.fun.band).toBe("ok");
    expect(s.fixed).toEqual({ budget: 70_000, spent: 70_000 });
    expect(s.variable).toEqual({ budget: 50_000, spent: 25_000 });
    expect(s.budget).toBe(120_000);
  });

  it("flags a fixed bill that costs more than planned", () => {
    const s = budgetStatus(lines, new Map([["rent", 70_100]]));
    expect(s.lines[0].band).toBe("over");
  });

  it("reports spending outside any line as unbudgeted and counts it in the total", () => {
    const s = budgetStatus(lines, new Map([["travel", 40_000]]));
    expect(s.unbudgeted).toBe(40_000);
    expect(s.spent).toBe(40_000);
  });
});
