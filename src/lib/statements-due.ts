import { addDays, addMonths, daysInMonth, type ISODate } from "./dates";

/**
 * Statement checklist (#5, owner, Nov 11 2026), read by Claude in the weekly
 * check-in: each account's last imported statement and whether a newer one is
 * out. Statements are monthly on the same day (Chequing on the last day of the
 * month) and show up online a couple of days after they close.
 */
export const READY_AFTER_DAYS = 2;

const isMonthEnd = (iso: ISODate) => Number(iso.slice(8, 10)) === daysInMonth(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)));

/** The statement after one that ended on `end`: same day next month, or month-end after a month-end. */
export function nextStatementEnd(end: ISODate): ISODate {
  if (!isMonthEnd(end)) return addMonths(end, 1);
  const next = addMonths(`${end.slice(0, 8)}01`, 1);
  return `${next.slice(0, 8)}${String(daysInMonth(Number(next.slice(0, 4)), Number(next.slice(5, 7)))).padStart(2, "0")}`;
}

export type StatementStatus = {
  /** Last statement imported (its closing date), or null if none ever. */
  lastEnd: ISODate | null;
  /** Closing date of the first statement not imported yet. */
  nextEnd: ISODate | null;
  /** Statements out but not imported (0 = up to date). */
  behind: number;
  /** When the oldest of those became available. */
  readySince: ISODate | null;
};

export function statementStatus(lastEnd: ISODate | null, today: ISODate): StatementStatus {
  if (!lastEnd) return { lastEnd: null, nextEnd: null, behind: 0, readySince: null };
  let next = nextStatementEnd(lastEnd);
  const first = next;
  let behind = 0;
  for (let i = 0; i < 24 && addDays(next, READY_AFTER_DAYS) <= today; i++) {
    behind++;
    next = nextStatementEnd(next);
  }
  return { lastEnd, nextEnd: first, behind, readySince: behind ? addDays(first, READY_AFTER_DAYS) : null };
}
