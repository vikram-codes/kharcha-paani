import { addMonths, type ISODate } from "./dates";

/**
 * Cash before payday (owner, Nov 11 2026): chequing's balance day by day from
 * today through the next paydays, from what's already known: bills paid from
 * chequing that haven't been recorded yet, and the paycheque. Facts only: it
 * shows the lowest point in each pay period and never suggests what to do.
 *
 * Same day: bills go out before the paycheque lands (the cautious order).
 * Overdue bills that still aren't recorded count as going out today.
 */
export type BillForecastInput = {
  name: string;
  cadence: string; // "once" | "monthly"
  /** The bill's schedule anchor (recurring_series.next_date). */
  nextDate: ISODate;
  /** The first occurrence not recorded yet (openOccurrence). */
  open: ISODate;
  endDate: ISODate | null;
  /** Signed: negative = money out. */
  cents: number;
};

export type CashEvent = { date: ISODate; cents: number; label: string; kind: "bill" | "payday" };

/** Occurrences of a bill from its open one through `until`. */
export function billDates(b: BillForecastInput, until: ISODate): ISODate[] {
  if (b.cadence !== "monthly") return b.open <= until ? [b.open] : [];
  const out: ISODate[] = [];
  // Step from the schedule anchor so a 31st stays the last day of short months.
  for (let i = 0; i < 120; i++) {
    const d = addMonths(b.nextDate, i);
    if (d > until || (b.endDate && d > b.endDate)) break;
    if (d >= b.open) out.push(d);
  }
  return out;
}

export type PayPeriod = {
  /** The payday that ends this period (its money isn't in the period). */
  payday: ISODate;
  /** Lowest balance before that payday, and when (today if nothing goes out). */
  low: { cents: number; date: ISODate };
  /** Bills in the period, in date order. */
  bills: CashEvent[];
  /** Balance the morning of the payday, after that day's bills, before the pay. */
  beforePay: number;
};

export type CashForecast = {
  start: number;
  today: ISODate;
  periods: PayPeriod[];
  /** Day-by-day balance (end of day) from today through the last payday. */
  days: { date: ISODate; cents: number }[];
};

export function cashForecast(input: {
  today: ISODate;
  /** Chequing balance now, cents. */
  start: number;
  bills: BillForecastInput[];
  /** Upcoming paid dates, ascending, each > today or today if not yet received. */
  paydays: ISODate[];
  payCents: number;
}): CashForecast {
  const { today, start, paydays, payCents } = input;
  const until = paydays[paydays.length - 1] ?? today;
  const events: CashEvent[] = [];
  for (const b of input.bills)
    for (const d of billDates(b, until)) events.push({ date: d < today ? today : d, cents: b.cents, label: b.name, kind: "bill" });
  for (const p of paydays) events.push({ date: p, cents: payCents, label: "Payday", kind: "payday" });
  // Date order; on the same day bills first, then pay.
  events.sort((a, b) => (a.date === b.date ? (a.kind === b.kind ? 0 : a.kind === "bill" ? -1 : 1) : a.date < b.date ? -1 : 1));

  const periods: PayPeriod[] = [];
  const days: { date: ISODate; cents: number }[] = [{ date: today, cents: start }];
  let bal = start;
  let period: PayPeriod = { payday: paydays[0] ?? today, low: { cents: start, date: today }, bills: [], beforePay: start };
  for (const e of events) {
    bal += e.cents;
    if (e.kind === "bill") {
      period.bills.push(e);
      if (bal < period.low.cents) period.low = { cents: bal, date: e.date };
    } else {
      period.beforePay = bal - e.cents;
      periods.push(period);
      const next = paydays[periods.length];
      period = { payday: next ?? e.date, low: { cents: bal, date: e.date }, bills: [], beforePay: bal };
    }
    const last = days[days.length - 1];
    if (last.date === e.date) last.cents = bal;
    else days.push({ date: e.date, cents: bal });
  }
  return { start, today, periods, days };
}
