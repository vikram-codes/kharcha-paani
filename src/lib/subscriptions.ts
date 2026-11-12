import { addDays, addMonths, daysBetween, type ISODate } from "./dates";
import { cleanMerchant } from "./merchant";
import { merchantKey } from "./recurring";

/**
 * Subscriptions and other recurring charges (#6, owner, Nov 11 2026), read by
 * Claude. Found from history: the same merchant charged about monthly (every
 * 25–35 days) or yearly (330–400 days) at a steady price. Unlike bill
 * suggestions, a price change doesn't hide it: the newest price counts and
 * the change is reported.
 */
export type Charge = { date: ISODate; amount_cents: number; description: string; account: string; category: string | null; group: string | null };

export type Recurring = {
  key: string;
  merchant: string;
  category: string | null;
  /** The category's group, e.g. "Subscriptions", "Bills", "Housing". */
  group: string | null;
  account: string;
  cadence: "monthly" | "yearly";
  /** Latest price, positive cents. */
  cents: number;
  monthlyCents: number;
  yearlyCents: number;
  lastDate: ISODate | null;
  nextDate: ISODate;
  charges: number;
  /** One of your bills in the app (it reminds you), not only spotted in your history. */
  isBill: boolean;
  /** Still being charged (the next one isn't long overdue). */
  active: boolean;
  /** The latest charge's price differs from the one before. */
  priceChange: { fromCents: number; toCents: number; on: ISODate } | null;
};

const close = (a: number, b: number, pct: number) => Math.abs(a - b) <= Math.max(50, Math.abs(b) * pct);

export function findRecurring(charges: readonly Charge[], today: ISODate): Recurring[] {
  const groups = new Map<string, Charge[]>();
  for (const c of charges) {
    if (c.amount_cents >= 0) continue;
    const key = merchantKey(c.description);
    if (key) groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (sorted.length < 2) continue;
    const gaps = sorted.slice(1).map((c, i) => daysBetween(sorted[i].date, c.date));
    const monthlyGaps = gaps.filter((g) => g >= 25 && g <= 35).length;
    const yearlyGaps = gaps.filter((g) => g >= 330 && g <= 400).length;
    const cadence: Recurring["cadence"] | null =
      sorted.length >= 3 && monthlyGaps >= Math.max(2, gaps.length * 0.75) ? "monthly" : yearlyGaps >= 1 && yearlyGaps === gaps.length ? "yearly" : null;
    if (!cadence) continue;

    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const first = sorted[0];
    // A steady price: almost every charge matches the latest price or the original one.
    const steady = sorted.filter((c) => close(c.amount_cents, last.amount_cents, 0.05) || close(c.amount_cents, first.amount_cents, 0.05)).length;
    if (steady < sorted.length * 0.8) continue;

    const cents = -last.amount_cents;
    const nextDate = cadence === "monthly" ? addMonths(last.date, 1) : addMonths(last.date, 12);
    const changed = !close(last.amount_cents, prev.amount_cents, 0.03);
    out.push({
      key,
      merchant: cleanMerchant(last.description),
      category: last.category,
      group: last.group,
      account: last.account,
      cadence,
      cents,
      monthlyCents: cadence === "monthly" ? cents : Math.round(cents / 12),
      yearlyCents: cadence === "monthly" ? cents * 12 : cents,
      lastDate: last.date,
      nextDate,
      charges: sorted.length,
      isBill: false,
      active: addDays(nextDate, cadence === "monthly" ? 20 : 45) >= today,
      priceChange: changed ? { fromCents: -prev.amount_cents, toCents: cents, on: last.date } : null,
    });
  }
  return out.sort((a, b) => b.monthlyCents - a.monthlyCents);
}

export type BillLike = { name: string; cents: number; category: string | null; group: string | null; account: string; nextDate: ISODate; endDate: ISODate | null };

/**
 * Adds your monthly bills: one that matches a charge found in history (same
 * merchant, or same category at about the same price) marks it as a bill;
 * the rest are added from the bill itself.
 */
export function withBills(found: Recurring[], bills: readonly BillLike[], today: ISODate): Recurring[] {
  const out = found.map((f) => ({ ...f }));
  for (const b of bills) {
    if (b.endDate && b.endDate < today) continue;
    const key = merchantKey(b.name);
    const hit = out.find((f) => f.active && (f.key === key || (!!b.category && f.category === b.category && close(-f.cents, -b.cents, 0.15))));
    if (hit) {
      hit.isBill = true;
      continue;
    }
    let next = b.nextDate;
    for (let i = 0; i < 120 && next < today; i++) next = addMonths(b.nextDate, i + 1);
    out.push({
      key,
      merchant: b.name,
      category: b.category,
      group: b.group,
      account: b.account,
      cadence: "monthly",
      cents: b.cents,
      monthlyCents: b.cents,
      yearlyCents: b.cents * 12,
      lastDate: null,
      nextDate: next,
      charges: 0,
      isBill: true,
      active: true,
      priceChange: null,
    });
  }
  return out.sort((a, b) => b.monthlyCents - a.monthlyCents);
}
