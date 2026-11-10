import { describe, expect, it } from "vitest";
import type { ActivityRow } from "@/lib/data";
import { mergeTransfers, transferSubtitle, transferTitle } from "./format";

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
    expect(out.map(transferSubtitle)).toEqual(["Transfer into Triangle", "Transfer out of Chequing", "Transfer into Chequing"]);
  });
});
