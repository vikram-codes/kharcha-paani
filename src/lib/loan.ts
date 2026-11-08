import { addMonths, monthKey, ymd, type ISODate } from "./dates";
import type { Cents } from "./money";

/**
 * Amortizing loan with monthly compounding (§3.2, student loan):
 * on the 1st of every month after the anchor, interest = balance × APR / 12
 * is added; payments reduce the balance on their date. All values are CAD cents,
 * owed amounts positive.
 */
export type LoanInput = {
  anchorOwed: Cents;
  anchorDate: ISODate;
  aprPct: number;
  /** Payments made after the anchor (positive cents). */
  payments: { date: ISODate; cents: Cents }[];
  today: ISODate;
};

export type LoanState = {
  owed: Cents;
  /** Interest added since the anchor. */
  interestSinceAnchor: Cents;
  /** Interest that will be added on the next 1st, on the current balance. */
  nextInterest: Cents;
  nextInterestDate: ISODate;
};

export const monthlyInterest = (owed: Cents, aprPct: number): Cents => Math.round((owed * aprPct) / 100 / 12);

export function loanState({ anchorOwed, anchorDate, aprPct, payments, today }: LoanInput): LoanState {
  type Ev = { date: ISODate; order: number; cents: Cents };
  const events: Ev[] = payments
    .filter((p) => p.date > anchorDate && p.date <= today)
    .map((p) => ({ date: p.date, order: 1, cents: -p.cents }));

  // Interest postings: the 1st of each month after the anchor, up to today.
  let first = ymd(Number(anchorDate.slice(0, 4)), Number(anchorDate.slice(5, 7)), 1);
  first = addMonths(first, 1);
  const interestDates: ISODate[] = [];
  while (first <= today) {
    interestDates.push(first);
    first = addMonths(first, 1);
  }

  let owed = anchorOwed;
  let interest = 0;
  const all = [...events, ...interestDates.map((d) => ({ date: d, order: 0, cents: 0 }))].sort(
    (a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1),
  );
  for (const e of all) {
    if (e.order === 0) {
      const i = monthlyInterest(owed, aprPct);
      owed += i;
      interest += i;
    } else {
      owed += e.cents;
    }
  }
  return { owed, interestSinceAnchor: interest, nextInterest: monthlyInterest(owed, aprPct), nextInterestDate: first };
}

/**
 * Projected payoff month paying `payment` monthly, or null if the payment
 * doesn't cover the interest. Capped at 50 years.
 */
export function payoffMonth(owed: Cents, aprPct: number, payment: Cents, from: ISODate): string | null {
  if (payment <= monthlyInterest(owed, aprPct)) return null;
  let bal = owed;
  let date = from;
  for (let i = 0; i < 600; i++) {
    date = addMonths(date, 1);
    bal += monthlyInterest(bal, aprPct);
    bal -= payment;
    if (bal <= 0) return monthKey(date);
  }
  return null;
}
