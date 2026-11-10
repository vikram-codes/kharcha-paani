import { describe, expect, it } from "vitest";
import type { ActivityRow } from "@/lib/data";
import { mergeTransfers, spentOf, transferTitle } from "./format";

let n = 0;
const row = (p: Partial<ActivityRow>): ActivityRow => ({
  id: `r${++n}`,
  date: "2026-11-09",
  amount_cents: -1000,
  description: "",
  note: null,
  account: "Scotiabank Chequing",
  accountGroup: "cash_bank",
  source: "manual",
  isTransfer: false,
  category: null,
  splits: [],
  accountId: "chq",
  owed: [],
  ...p,
});

describe("mergeTransfers", () => {
  it("shows a transfer once, as from → to", () => {
    const rows = [
      row({ isTransfer: true, amount_cents: -100000, description: "Payment to Triangle Mastercard" }),
      row({ isTransfer: true, amount_cents: 100000, account: "Triangle Mastercard", accountId: "tri" }),
      row({ amount_cents: -1250, description: "Tim Hortons" }),
    ];
    const out = mergeTransfers(rows);
    expect(out).toHaveLength(2);
    expect(transferTitle(out[0])).toBe("Chequing → Triangle");
    expect(out[0].amount_cents).toBe(-100000);
    expect(out[1].description).toBe("Tim Hortons");
  });

  it("pairs imported legs a couple of days apart, newest leg's position kept", () => {
    const rows = [
      row({ isTransfer: true, date: "2026-10-19", amount_cents: 20000, account: "Triangle Mastercard", accountId: "tri" }),
      row({ isTransfer: true, date: "2026-10-17", amount_cents: -20000 }),
    ];
    const out = mergeTransfers(rows);
    expect(out).toHaveLength(1);
    expect(transferTitle(out[0])).toBe("Chequing → Triangle");
    expect(out[0].date).toBe("2026-10-17");
  });

  it("doesn't pair legs too far apart or on the same account", () => {
    const rows = [
      row({ isTransfer: true, date: "2026-10-20", amount_cents: 5000, account: "Triangle Mastercard", accountId: "tri" }),
      row({ isTransfer: true, date: "2026-10-10", amount_cents: -5000 }),
      row({ isTransfer: true, date: "2026-10-10", amount_cents: 5000 }),
    ];
    const out = mergeTransfers(rows);
    expect(out.map(transferTitle)).toEqual(["Into Triangle", "Out of Chequing", "Into Chequing"]);
  });
});

describe("transfer flow (chequing's side)", () => {
  const leg = (p: Partial<ActivityRow>) => row({ isTransfer: true, ...p });
  const flows = (rows: ActivityRow[]) => mergeTransfers(rows).map((r) => r.flow);
  it("out of chequing is negative, into chequing positive", () => {
    expect(flows([leg({ amount_cents: -5000 }), leg({ amount_cents: 5000, account: "Triangle Mastercard", accountGroup: "debt_card", accountId: "tri" })])).toEqual([-5000]);
    expect(flows([leg({ amount_cents: -5000, account: "Scotiabank Savings", accountId: "sav" }), leg({ amount_cents: 5000 })])).toEqual([5000]);
  });
  it("single legs: a bank leg keeps its sign, a card payment counts as money out", () => {
    expect(flows([leg({ amount_cents: 70038 })])).toEqual([70038]);
    expect(flows([leg({ amount_cents: 20000, account: "Costco CIBC Mastercard", accountGroup: "debt_card", accountId: "cibc" })])).toEqual([-20000]);
  });
});

describe("spentOf", () => {
  it("leaves out transfers, money in and the part a friend owes back", () => {
    const rows = [
      row({ id: "a", amount_cents: -6000, owed: [{ id: "o", person: "Sam", amount_cents: 3000, settled: false }] }),
      row({ id: "b", amount_cents: -2000 }),
      row({ id: "c", amount_cents: -100000, isTransfer: true }),
      row({ id: "d", amount_cents: 5000 }),
    ];
    expect(spentOf(rows)).toBe(5000);
  });
});
