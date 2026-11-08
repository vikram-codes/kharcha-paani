import { describe, expect, it } from "vitest";
import { suggestCategory } from "./categorize";
import { fingerprints, matchDuplicates } from "./dedupe";

describe("matchDuplicates", () => {
  const existing = [
    { id: "a", date: "2026-11-10", amount_cents: -1500, description: "TIM HORTONS #1739 LONDON ON" },
    { id: "b", date: "2026-11-12", amount_cents: -4250, description: "Groceries" }, // logged by hand
  ];

  it("skips exact duplicates, flags near matches, keeps the rest", () => {
    const m = matchDuplicates(
      [
        { date: "2026-11-10", amount_cents: -1500, description: "TIM HORTONS #1739 LONDON ON" },
        { date: "2026-11-13", amount_cents: -4250, description: "FRESHCO #9863 LONDON ON" },
        { date: "2026-11-14", amount_cents: -999, description: "NEW PLACE" },
      ],
      existing,
    );
    expect(m.map((x) => x.status)).toEqual(["duplicate", "possible", "new"]);
    expect(m[1].existingId).toBe("b");
  });

  it("uses each existing row once (two identical coffees, one already saved)", () => {
    const row = { date: "2026-11-10", amount_cents: -1500, description: "TIM HORTONS #1739 LONDON ON" };
    expect(matchDuplicates([row, row], existing).map((x) => x.status)).toEqual(["duplicate", "new"]);
  });

  it("doesn't match beyond 3 days or different amounts", () => {
    const m = matchDuplicates([{ date: "2026-11-20", amount_cents: -4250, description: "X" }, { date: "2026-11-12", amount_cents: -4251, description: "X" }], existing);
    expect(m.map((x) => x.status)).toEqual(["new", "new"]);
  });
});

describe("fingerprints", () => {
  it("numbers identical same-day rows", () => {
    const r = { date: "2026-11-10", amount_cents: -1500, description: "Tim Hortons" };
    const [a, b] = fingerprints([r, r]);
    expect(a).not.toBe(b);
    expect(a.endsWith("|0")).toBe(true);
    expect(b.endsWith("|1")).toBe(true);
  });
});

describe("suggestCategory", () => {
  it.each([
    ["TST-India Paradise Lon London ON Restaurants", -7458, "eating_out"],
    ["CTFS.COM/PAYMENTS OAKVILLE ON", 20000, "cc_payment"],
    ["Point of sale purchase | Opos Remitly* K0C31 Vanco", -55000, "student_loan"],
    ["Deposit | 01229848 Free Interac E-Transfer", 3200, "friend_payback"],
    ["Withdrawal | 90974714 Free Interac E-Transfer", -20000, null],
    ["SOMETHING UNKNOWN", -100, null],
  ])("%s → %s", (desc, amt, key) => {
    expect(suggestCategory(desc, amt)).toBe(key);
  });
});
