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

/** Row title: your note for manual entries, else the cleaned merchant. */
export const rowTitle = (r: ActivityRow) => (r.note && r.source === "manual" ? r.note : cleanMerchant(r.description) || r.category?.name || "—");

export const rowSubtitle = (r: ActivityRow) =>
  r.splits.length ? `Split · ${r.splits.map((s) => s.name).join(" + ")}` : r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized");

/** Spending only (money out, not transfers). */
export const spentOf = (rows: ActivityRow[]) => rows.filter((r) => !r.isTransfer && r.amount_cents < 0).reduce((t, r) => t - r.amount_cents, 0);
