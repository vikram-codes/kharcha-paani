/**
 * Calendar-date helpers on ISO "YYYY-MM-DD" strings. All math is in UTC so a
 * device's timezone can never shift a date by a day.
 */
export type ISODate = string;

export const TIMEZONE = "America/Toronto";

export function toDate(iso: ISODate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError(`Not an ISO date: "${iso}"`);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function ymd(y: number, month1: number, day: number): ISODate {
  return toISO(new Date(Date.UTC(y, month1 - 1, day)));
}

/**
 * Today's date in Toronto. In local development only, KP_FAKE_TODAY=YYYY-MM-DD
 * pretends it's another day (to test month-end and payday prompts).
 */
export function todayISO(now: Date = new Date()): ISODate {
  const fake = typeof process !== "undefined" && process.env.NODE_ENV === "development" ? process.env.KP_FAKE_TODAY : undefined;
  if (fake && /^\d{4}-\d{2}-\d{2}$/.test(fake)) return fake;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Adds months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const d = toDate(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);
  target.setUTCDate(Math.min(day, last));
  return toISO(target);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: ISODate): number {
  return toDate(iso).getUTCDay();
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

/** "2026-12" */
export type MonthKey = string;

export function monthKey(iso: ISODate): MonthKey {
  return iso.slice(0, 7);
}

export function isMonthKey(s: string): s is MonthKey {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthRange(month: MonthKey): { start: ISODate; end: ISODate } {
  const [y, m] = month.split("-").map(Number);
  return { start: ymd(y, m, 1), end: ymd(y, m, daysInMonth(y, m)) };
}

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  return monthKey(addMonths(`${month}-01`, by));
}

/** nth (1-based) given weekday of a month; n = -1 for the last one. */
export function nthWeekday(year: number, month1: number, wd: number, n: number): ISODate {
  if (n > 0) {
    const first = weekday(ymd(year, month1, 1));
    return ymd(year, month1, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = daysInMonth(year, month1);
  const last = weekday(ymd(year, month1, lastDay));
  return ymd(year, month1, lastDay - ((last - wd + 7) % 7));
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", ...opts });
const shortFmt = fmt({ month: "short", day: "numeric" });
const dayFmt = fmt({ weekday: "short", month: "short", day: "numeric" });
const monthFmt = fmt({ month: "long", year: "numeric" });
const monthOnlyFmt = fmt({ month: "long" });

/** "Nov 10" */
export const formatShort = (iso: ISODate) => shortFmt.format(toDate(iso));
/** "Fri, Nov 20" */
export const formatDay = (iso: ISODate) => dayFmt.format(toDate(iso)).replace(".", "");
/** "November 2026" */
export const formatMonth = (month: MonthKey) => monthFmt.format(toDate(`${month}-01`));
/** "November" */
export const formatMonthName = (month: MonthKey) => monthOnlyFmt.format(toDate(`${month}-01`));
