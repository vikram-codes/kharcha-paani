import { cleanMerchant } from "./merchant";

/**
 * Recurring-bill detection (§7.7): the same merchant charged roughly monthly
 * (every 25–35 days) for a similar amount (within 15% of the typical charge),
 * at least 3 times in the window. Returns one suggestion per merchant.
 */
export type RecurringInput = { date: string; amount_cents: number; description: string; account_id: string; category_id: string | null };

export type RecurringSuggestion = {
  key: string;
  merchant: string;
  /** Typical charge (median), negative = money out. */
  amount_cents: number;
  /** Next expected date (last charge + median interval, snapped to the same day of month). */
  next_date: string;
  account_id: string;
  category_id: string | null;
  occurrences: number;
  last_date: string;
};

const DAY = 86_400_000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export const merchantKey = (description: string) => cleanMerchant(description).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function detectRecurring(rows: readonly RecurringInput[], minOccurrences = 3): RecurringSuggestion[] {
  const groups = new Map<string, RecurringInput[]>();
  for (const r of rows) {
    if (r.amount_cents >= 0) continue; // bills are money out
    const key = merchantKey(r.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    if (list.length < minOccurrences) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const typical = median(sorted.map((r) => r.amount_cents));
    const similar = sorted.filter((r) => Math.abs(r.amount_cents - typical) <= Math.abs(typical) * 0.15);
    if (similar.length < minOccurrences) continue;
    const gaps = similar.slice(1).map((r, i) => (Date.parse(r.date) - Date.parse(similar[i].date)) / DAY);
    const monthly = gaps.filter((g) => g >= 25 && g <= 35);
    if (monthly.length < minOccurrences - 1 || monthly.length < gaps.length * 0.6) continue;
    const last = similar[similar.length - 1];
    const lastDate = new Date(Date.parse(last.date));
    const next = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + 1, 1));
    const dim = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(lastDate.getUTCDate(), dim));
    out.push({
      key,
      merchant: cleanMerchant(last.description),
      amount_cents: typical,
      next_date: next.toISOString().slice(0, 10),
      account_id: last.account_id,
      category_id: last.category_id,
      occurrences: similar.length,
      last_date: last.date,
    });
  }
  return out.sort((a, b) => a.amount_cents - b.amount_cents);
}
