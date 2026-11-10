import { addDays, addMonths, daysBetween, type ISODate } from "@/lib/dates";

/** A bill stays on the list this many days after its date if it hasn't been added yet. */
export const OVERDUE_GRACE_DAYS = 3;
/** "Add" badge: due today/tomorrow, or overdue and not added yet (owner, Nov 10 2026). */
export const ADD_BADGE_DAYS = 1;

export type BillSchedule = {
  cadence: string;
  next_date: string;
  end_date: string | null;
  amount_cents: number;
  category_id: string | null;
  account_id: string | null;
};
/** A transaction (or one split of it) near the bill's dates. */
export type LedgerHit = {
  date: ISODate;
  cents: number;
  categoryId: string | null;
  accountId: string;
};

/**
 * Whether this occurrence already has its transaction: same category or same
 * paying account (it may have been filed under another category), same
 * direction, within 10% (or $1) of the amount, dated 5 days before to 2 after.
 * Catches entries from quick-add, imports and Claude alike.
 */
export function isRecorded(
  bill: BillSchedule,
  due: ISODate,
  hits: LedgerHit[],
): boolean {
  const want = bill.amount_cents;
  const slack = Math.max(100, Math.abs(want) * 0.1);
  return hits.some((t) => {
    const sameCategory =
      !!bill.category_id && t.categoryId === bill.category_id;
    const sameAccount = !!bill.account_id && t.accountId === bill.account_id;
    if (
      !(sameCategory || sameAccount) ||
      Math.sign(t.cents) !== Math.sign(want)
    )
      return false;
    if (Math.abs(Math.abs(t.cents) - Math.abs(want)) > slack) return false;
    const d = daysBetween(due, t.date);
    return d >= -5 && d <= 2;
  });
}

/**
 * The occurrence to show: the earliest one not yet recorded, from up to 3 days
 * ago onward. Null when the bill is finished (or a one-off already paid).
 */
export function openOccurrence(
  bill: BillSchedule,
  today: ISODate,
  hits: LedgerHit[],
): ISODate | null {
  const oldest = addDays(today, -OVERDUE_GRACE_DAYS);
  const lookAhead = addDays(today, 7); // nobody records a bill earlier than a week ahead
  const monthly = bill.cadence === "monthly";
  let i = 0;
  let d = bill.next_date as ISODate;
  const next = () => (d = addMonths(bill.next_date as ISODate, ++i));
  if (monthly) while (d < oldest) next();
  else if (d < oldest) return null;
  while (d <= lookAhead && isRecorded(bill, d, hits)) {
    if (!monthly) return null;
    next();
  }
  if (bill.end_date && d > bill.end_date) return null;
  return d;
}

/** Due today or tomorrow, or overdue (still unrecorded): time to add it. */
export const needsAdding = (date: ISODate, today: ISODate) =>
  daysBetween(today, date) <= ADD_BADGE_DAYS;

/** "today", "tomorrow", "in 4 days", "yesterday", "2 days ago". */
export function dueLabel(inDays: number) {
  if (inDays === 0) return "today";
  if (inDays === 1) return "tomorrow";
  if (inDays === -1) return "yesterday";
  return inDays < 0 ? `${-inDays} days ago` : `in ${inDays} days`;
}
