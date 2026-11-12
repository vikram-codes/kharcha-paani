import { describe, expect, it } from "vitest";
import { detectStatement, parseStatement } from "./statements";

// Synthetic statements (the real PDFs are private and never committed; scripts/verify-statements.mts checks those).
const triangleJan = `
Triangle Mastercard   Canadian Tire Bank
Statement date: January 18, 2027
Balance from your last statement   $100.00
  Dec 28   Dec 29   PETRO-CANADA LONDON ON        40.00
  Jan 3    Jan 4    CTFS.COM/PAYMENTS OAKVILLE ON   -100.00
  Jan 5    Jan 6    1 9619 BOSCH SPK PLG            9.99
  Jan 5    Jan 6    CDN TIRE STORE #123 LONDON ON   20.00
Your New Balance   $60.00
`;

const chequing = `
Opening Balance on September 1, 2026   $1,000.00
Closing Balance on September 30, 2026   $1,250.00
     Sep 1    Opening Balance                          1,000.00
     Sep 3    Payroll dep.                  500.00     1,500.00
              INFO-TECH RESEARCH
  -  Sep 8    Point of sale purchase        250.00     1,250.00
              Opos Remitly* S48Fe Vanco
`;

// Statement headers with the payment box, as each card prints it.
const cards = {
  triangle: `Triangle Mastercard   Canadian Tire Bank
Statement date: October 18, 2026
For the period: September 19, 2026 to October 18, 2026
Your New Balance $2,995.00
Pay this amount by the Payment due date indicated below to avoid interest
Balance Due $2,995.00
Minimum payment due $66.73
Payment due date Nov 9, 2026`,
  cibc: `CIBC Costco Mastercard
                                       Statement Date
                                       October 18, 2026
  Your account at a glance             October statement period
                                       September 19 to October 18, 2026
  Previous balance          $177.07
  Total balance             =     $1,579.50
  Minimum Payment due by
  Minimum Payment                      $10.00
  Please pay this amount by Nov 09, 2026
  days of this Statement Date. If you do not`,
  scotia: `Statement  Period      Oct 6, 2026 - Nov 5, 2026
Statement  Date                    Nov 5, 2026
SUB-TOTAL DEBITS   $0.00
Payment   Due  Date   Nov  26, 2026
New   Balance‡   =   $0.00
Total Minimum   Payment   $0.00
Account   Balance   =   $1.67  CR`,
};

describe("statement dates and payment due", () => {
  it("reads the closing date, not the later payment due date", () => {
    expect(parseStatement(cards.triangle).periodEnd).toBe("2026-10-18");
    expect(parseStatement(cards.scotia).periodEnd).toBe("2026-11-05");
    expect(parseStatement(chequing).periodEnd).toBe("2026-09-30");
  });

  it("reads each card's due date, statement balance and minimum", () => {
    expect(parseStatement(cards.triangle).payment).toEqual({ dueDate: "2026-11-09", balanceCents: 299500, minimumCents: 6673 });
    expect(parseStatement(cards.scotia).payment).toEqual({ dueDate: "2026-11-26", balanceCents: 0, minimumCents: 0 });
    expect(parseStatement(chequing).payment).toBeNull();
  });

  it("reads CIBC's column layout", async () => {
    const { detectStatement: d } = await import("./statements");
    const text = cards.cibc;
    expect(d(text)).toBe("cibc_costco");
    const s = parseStatement(text);
    expect(s.periodEnd).toBe("2026-10-18");
    expect(s.payment).toEqual({ dueDate: "2026-11-09", balanceCents: 157950, minimumCents: 1000 });
  });
});

describe("statement parsing", () => {
  it("detects the bank from the text", () => {
    expect(detectStatement(triangleJan)).toBe("triangle");
    expect(detectStatement(chequing)).toBe("scotia_chequing");
    expect(detectStatement("hello")).toBeNull();
  });

  it("puts December rows of a January statement in the previous year and skips item-detail lines", () => {
    const s = parseStatement(triangleJan);
    expect(s.rows.map((r) => [r.date, r.amount_cents])).toEqual([
      ["2026-12-28", -4000],
      ["2027-01-03", 10000],
      ["2027-01-05", -2000],
    ]);
    expect(s.checks.every((c) => c.ok)).toBe(true);
  });

  it("infers chequing signs from the running balance and reads the detail line", () => {
    const s = parseStatement(chequing);
    expect(s.rows).toEqual([
      { date: "2026-09-03", posted: null, amount_cents: 50000, description: "Payroll dep. | INFO-TECH RESEARCH" },
      { date: "2026-09-08", posted: null, amount_cents: -25000, description: "Point of sale purchase | Opos Remitly* S48Fe Vanco" },
    ]);
    expect(s.checks[0].ok).toBe(true);
  });

  it("flags a statement that doesn't add up", () => {
    const s = parseStatement(triangleJan.replace("$60.00", "$61.00"));
    expect(s.checks[0].ok).toBe(false);
  });
});
