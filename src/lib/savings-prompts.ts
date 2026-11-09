import { addDays, daysInMonth, monthKey, shiftMonth, type ISODate } from "./dates";
import { paydaysBetween, type PaySchedule } from "./paydays";

/**
 * Savings prompts (§7.1, §7.2):
 *  - "third-pay:YYYY-MM": in a 3-paycheque month, from the 3rd payday until the
 *    5th of the next month, offer to move that paycheque to savings.
 *  - "month-end:YYYY-MM": in the last 3 days of a month and the first 5 of the
 *    next, if spending came in under the budget, offer to move the rest to savings.
 * Each prompt has a key so it can be done/dismissed once.
 */
export type SavingsPrompt =
  | { key: string; kind: "third-pay"; month: string; amount_cents: number; payday: ISODate }
  | { key: string; kind: "month-end"; month: string; amount_cents: number; spent: number; budget: number };

export function thirdPaychequePrompt(s: PaySchedule, paycheque: number, today: ISODate): SavingsPrompt | null {
  // The month to check: this one, or last month during its first 5 days.
  for (const month of [monthKey(today), Number(today.slice(8)) <= 5 ? shiftMonth(monthKey(today), -1) : null]) {
    if (!month) continue;
    const [y, m] = month.split("-").map(Number);
    const pays = paydaysBetween(s, `${month}-01`, `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`);
    if (pays.length < 3) continue;
    const third = pays[2].paid;
    const until = addDays(`${shiftMonth(month, 1)}-01`, 4);
    if (today >= third && today <= until) return { key: `third-pay:${month}`, kind: "third-pay", month, amount_cents: paycheque, payday: third };
  }
  return null;
}

export function monthEndPrompt(month: string, spent: number, budget: number, today: ISODate): SavingsPrompt | null {
  if (budget <= 0 || spent >= budget) return null;
  const [y, m] = month.split("-").map(Number);
  const lastDay = `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
  const from = addDays(lastDay, -2);
  const until = addDays(`${shiftMonth(month, 1)}-01`, 4);
  if (today < from || today > until) return null;
  return { key: `month-end:${month}`, kind: "month-end", month, amount_cents: budget - spent, spent, budget };
}
