import type { ActivityRow } from "@/lib/data";
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

/** Spending only (money out, not transfers). */
export const spentOf = (rows: ActivityRow[]) => rows.filter((r) => !r.isTransfer && r.amount_cents < 0).reduce((t, r) => t - r.amount_cents, 0);
