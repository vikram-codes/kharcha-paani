import { addDays, monthKey, nthWeekday, weekday, ymd, type ISODate, type MonthKey } from "./dates";

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** A fixed-date holiday falling on a weekend is observed the following Monday. */
function observedMonday(iso: ISODate): ISODate {
  const wd = weekday(iso);
  return wd === 6 ? addDays(iso, 2) : wd === 0 ? addDays(iso, 1) : iso;
}

/** Ontario statutory holidays (observed dates) for a year. */
export function ontarioHolidays(year: number): Set<ISODate> {
  const christmas = ymd(year, 12, 25);
  const boxing = ymd(year, 12, 26);
  const xmasWd = weekday(christmas);
  // Christmas on Sat → Mon 27 + Tue 28; on Sun → Boxing Mon 26 + Christmas Tue 27.
  const [xmasObs, boxingObs] =
    xmasWd === 6 ? [ymd(year, 12, 27), ymd(year, 12, 28)]
    : xmasWd === 0 ? [ymd(year, 12, 27), boxing]
    : xmasWd === 5 ? [christmas, ymd(year, 12, 28)]
    : [christmas, boxing];

  // Victoria Day: the Monday before May 25.
  const may24 = ymd(year, 5, 24);
  const victoria = addDays(may24, -((weekday(may24) + 6) % 7));

  return new Set([
    observedMonday(ymd(year, 1, 1)), // New Year's Day
    nthWeekday(year, 2, 1, 3), // Family Day: 3rd Monday of Feb
    addDays(easterSunday(year), -2), // Good Friday
    victoria,
    observedMonday(ymd(year, 7, 1)), // Canada Day
    nthWeekday(year, 9, 1, 1), // Labour Day
    nthWeekday(year, 10, 1, 2), // Thanksgiving
    xmasObs,
    boxingObs,
  ]);
}

export function isBusinessDay(iso: ISODate): boolean {
  const wd = weekday(iso);
  return wd !== 0 && wd !== 6 && !ontarioHolidays(Number(iso.slice(0, 4))).has(iso);
}

export type HolidayRule = "business_day_before" | "business_day_after";

export function adjustToBusinessDay(iso: ISODate, rule: HolidayRule = "business_day_before"): ISODate {
  const step = rule === "business_day_before" ? -1 : 1;
  let d = iso;
  while (!isBusinessDay(d)) d = addDays(d, step);
  return d;
}

export type PaySchedule = { anchor: ISODate; everyDays: number; rule: HolidayRule };

export type Payday = { scheduled: ISODate; paid: ISODate };

/** All paydays whose *paid* date falls in [from, to]. */
export function paydaysBetween(s: PaySchedule, from: ISODate, to: ISODate): Payday[] {
  const out: Payday[] = [];
  // Start a little before `from`: a payday shifted earlier can land inside the range.
  const span = Math.floor((Date.parse(from) - Date.parse(s.anchor)) / 86_400_000);
  let n = Math.floor(span / s.everyDays) - 1;
  for (;;) {
    const scheduled = addDays(s.anchor, n * s.everyDays);
    const paid = adjustToBusinessDay(scheduled, s.rule);
    if (paid > to && scheduled > to) break;
    if (paid >= from && paid <= to) out.push({ scheduled, paid });
    n++;
  }
  return out;
}

export function nextPayday(s: PaySchedule, today: ISODate): Payday {
  const [p] = paydaysBetween(s, today, addDays(today, s.everyDays + 7));
  return p;
}

/** Months (in [fromMonth, toMonth]) that get 3 paycheques. The 3rd goes to savings (§7.1). */
export function threePaychequeMonths(s: PaySchedule, from: ISODate, to: ISODate): MonthKey[] {
  const counts = new Map<MonthKey, number>();
  for (const p of paydaysBetween(s, from, to)) {
    const m = monthKey(p.paid);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 3).map(([m]) => m);
}
