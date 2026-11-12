import { describe, expect, it } from "vitest";
import { suggestCategory } from "./categorize";
import { fingerprints, historyCategories, matchDuplicates } from "./dedupe";

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

  it("doesn't match beyond 5 days, or an imported row with a different amount", () => {
    const m = matchDuplicates([{ date: "2026-11-20", amount_cents: -4250, description: "X" }, { date: "2026-11-12", amount_cents: -4251, description: "X" }], existing);
    expect(m.map((x) => x.status)).toEqual(["new", "new"]);
  });
});

describe("matchDuplicates: entries you added by hand", () => {
  const mine = (id: string, date: string, amount_cents: number, description = "Eating out") => ({ id, date, amount_cents, description, source: "manual" });

  it("matches a tip or exchange-rate difference to your entry", () => {
    const m = matchDuplicates([{ date: "2026-11-08", amount_cents: -2350, description: "OSMOWS LONDON" }], [mine("a", "2026-11-07", -2000)]);
    expect(m[0]).toMatchObject({ status: "possible", existingId: "a", kind: "close-amount" });
  });

  it("doesn't call a much bigger charge the same purchase", () => {
    const m = matchDuplicates([{ date: "2026-11-08", amount_cents: -5000, description: "OSMOWS LONDON" }], [mine("a", "2026-11-07", -2000)]);
    expect(m[0].status).toBe("new");
  });

  it("prefers an exact amount over a close one", () => {
    const m = matchDuplicates([{ date: "2026-11-08", amount_cents: -1920, description: "TIM HORTONS" }], [mine("near", "2026-11-08", -2000), mine("exact", "2026-11-06", -1920)]);
    expect(m[0]).toMatchObject({ existingId: "exact", kind: "same-amount" });
  });

  it("matches one charge to two items you entered separately", () => {
    const m = matchDuplicates(
      [{ date: "2026-11-08", amount_cents: -4187, description: "WALMART.CA" }],
      [mine("g", "2026-11-07", -2037, "Groceries"), mine("s", "2026-11-07", -2150, "Slipper"), mine("x", "2026-11-07", -999)],
    );
    expect(m[0]).toMatchObject({ status: "possible", kind: "combined", existingIds: ["g", "s"] });
  });

  it("matches a posting up to 5 days after you added it", () => {
    const m = matchDuplicates([{ date: "2026-11-12", amount_cents: -5327, description: "COSTCO GAS" }], [mine("f", "2026-11-07", -5327, "Fuel")]);
    expect(m[0]).toMatchObject({ status: "possible", kind: "same-amount" });
  });
});

describe("matchDuplicates: names", () => {
  const mine = (id: string, date: string, amount_cents: number, description: string, extra: object = {}) => ({ id, date, amount_cents, description, source: "manual", ...extra });

  it("never matches bank interest to a purchase with a close amount", () => {
    const m = matchDuplicates([{ date: "2026-10-18", amount_cents: -5673, description: "INTEREST CHARGES" }], [mine("e", "2026-10-18", -5500, "Eating out")]);
    expect(m[0].status).toBe("new");
  });

  it("doesn't match a close amount to an entry naming another merchant", () => {
    const m = matchDuplicates(
      [{ date: "2026-10-18", amount_cents: -5673, description: "AIR CANADA" }],
      [mine("e", "2026-10-18", -5500, "EMIRATES 11764224127045", { bankLike: true })],
    );
    expect(m[0].status).toBe("new");
  });

  it("flags the exact amount under another merchant's name, without assuming", () => {
    const m = matchDuplicates(
      [{ date: "2026-10-13", amount_cents: -3727, description: "WALMART.CA" }],
      [mine("a", "2026-10-16", -3727, "AMZN Mktp CA*AB12", { bankLike: true })],
    );
    expect(m[0]).toMatchObject({ status: "possible", confident: false });
  });

  it("picks the entry whose name agrees over a closer date", () => {
    const m = matchDuplicates(
      [{ date: "2026-10-18", amount_cents: -5673, description: "EMIRATES 11764224127045 DUBAI" }],
      [mine("x", "2026-10-18", -5500, "Eating out"), mine("em", "2026-10-16", -5500, "Flight", { note: "Emirates seat" })],
    );
    expect(m[0]).toMatchObject({ existingId: "em", kind: "close-amount", confident: true });
  });
});

describe("historyCategories", () => {
  it("files a merchant where you usually put it, by direction", () => {
    const pick = historyCategories([
      { key: "osmows", amount_cents: -1500, categoryId: "eating" },
      { key: "osmows", amount_cents: -2100, categoryId: "eating" },
      { key: "osmows", amount_cents: -900, categoryId: "groceries" },
      { key: "osmows", amount_cents: 1500, categoryId: "refund" },
    ]);
    expect(pick("osmows", -1800)).toBe("eating");
    expect(pick("osmows", 500)).toBe("refund");
    expect(pick("new place", -100)).toBeNull();
  });

  it("stays out of it when there's no clear habit", () => {
    const pick = historyCategories([
      { key: "amzn", amount_cents: -1500, categoryId: "online" },
      { key: "amzn", amount_cents: -2100, categoryId: "household" },
    ]);
    expect(pick("amzn", -1000)).toBeNull();
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
