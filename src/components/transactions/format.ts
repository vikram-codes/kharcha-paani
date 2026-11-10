import type { ActivityRow } from "@/lib/data";
import { daysBetween } from "@/lib/dates";
import { cleanMerchant } from "@/lib/merchant";

const ACCOUNT_SHORT: [RegExp, string][] = [
  [/chequing/i, "Chequing"],
  [/savings/i, "Savings"],
  [/scene/i, "Scene+ Visa"],
  [/cibc|costco/i, "CIBC"],
  [/triangle/i, "Triangle"],
  [/cashew/i, "Cashew"],
  [/money pro/i, "Money Pro"],
];

export const shortAccount = (name: string) => ACCOUNT_SHORT.find(([re]) => re.test(name))?.[1] ?? name;

/**
 * Row title: the merchant when there is one (bank descriptor, cleaned); your
 * note when the note IS the description (quick-add uses the note as the name).
 */
export const rowTitle = (r: ActivityRow) =>
  (r.note && (!r.description || r.description === r.note) ? r.note : cleanMerchant(r.description)) || r.note || r.category?.name || "—";

/** A note that isn't already the title, shown under it. */
const extraNote = (r: ActivityRow) => (r.note && r.note !== rowTitle(r) ? ` · ${r.note}` : "");

export const rowSubtitle = (r: ActivityRow) =>
  (r.splits.length ? `Split · ${r.splits.map((s) => s.name).join(" + ")}` : r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized")) + extraNote(r);

export type FeedRow = ActivityRow & {
  /** For transfers: where the money went. Either side can be unknown when only one leg was imported. */
  route?: { from: string | null; to: string | null };
};

/**
 * Activity with each transfer shown once: the money-out leg and its money-in
 * leg (another account, same amount, within 3 days; imported statements don't
 * link them) become one "Chequing → Triangle" row. Order is kept.
 */
export function mergeTransfers(rows: ActivityRow[]): FeedRow[] {
  const used = new Set<string>();
  const out: FeedRow[] = [];
  for (const r of rows) {
    if (!r.isTransfer) {
      out.push(r);
      continue;
    }
    if (used.has(r.id)) continue;
    used.add(r.id);
    const other = rows.find(
      (o) =>
        o.isTransfer &&
        !used.has(o.id) &&
        o.accountId !== r.accountId &&
        o.amount_cents === -r.amount_cents &&
        Math.abs(daysBetween(o.date, r.date)) <= 3,
    );
    if (other) {
      used.add(other.id);
      const [from, to] = r.amount_cents < 0 ? [r, other] : [other, r];
      out.push({ ...from, route: { from: shortAccount(from.account), to: shortAccount(to.account) } });
    } else {
      const acct = shortAccount(r.account);
      out.push({ ...r, route: r.amount_cents < 0 ? { from: acct, to: null } : { from: null, to: acct } });
    }
  }
  return out;
}

export const transferTitle = (r: FeedRow) =>
  r.route?.from && r.route.to ? `${r.route.from} → ${r.route.to}` : rowTitle(r);

export const transferSubtitle = (r: FeedRow) =>
  (r.route?.from && r.route.to
    ? "Transfer"
    : r.route?.from
      ? `Transfer out of ${r.route.from}`
      : r.route?.to
        ? `Transfer into ${r.route.to}`
        : "Transfer") + (r.note && r.note !== transferTitle(r) ? ` · ${r.note}` : "");

/** Spending only (money out, not transfers). */
export const spentOf = (rows: ActivityRow[]) => rows.filter((r) => !r.isTransfer && r.amount_cents < 0).reduce((t, r) => t - r.amount_cents, 0);
