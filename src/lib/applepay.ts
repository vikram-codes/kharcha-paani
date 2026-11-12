/**
 * Apple Pay → Kharcha-Paani (#9, owner, Nov 11 2026). An iOS Shortcuts
 * "Transaction" automation posts { amount, merchant, card } for each
 * tap-to-pay purchase. These helpers read what Shortcuts sends.
 */

/**
 * The amount as Shortcuts sends it: a number, or text like "5.42", "$5.42",
 * "CA$1,234.56" or "5,42". Returns positive cents, or null if it isn't one.
 */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 && v < 1_000_000 ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,-]/g, "");
  if (!s || s.startsWith("-")) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 && cents < 100_000_000 ? cents : null;
}

export type CardAccount = { id: string; key: string; name: string; last4: string | null; account_group: string };

/**
 * Which account a Wallet card name is: its last 4 digits if the name has
 * them, otherwise the bank/card words ("Triangle", "Costco", "Scene+",
 * "Debit"). Null when it can't tell.
 */
export function matchCard(walletName: string, accounts: readonly CardAccount[]): string | null {
  const name = walletName.toLowerCase();
  const digits = /(\d{4})\b/.exec(walletName)?.[1];
  if (digits) {
    const hit = accounts.find((a) => a.last4 === digits);
    if (hit) return hit.id;
  }
  const byKey = (test: (a: CardAccount) => boolean) => accounts.find(test)?.id ?? null;
  if (/triangle|canadian tire|ctfs/.test(name)) return byKey((a) => a.key === "triangle");
  if (/costco|cibc/.test(name)) return byKey((a) => a.key === "cibc_costco");
  if (/scene|visa/.test(name)) return byKey((a) => a.key === "scotia_visa");
  if (/debit|chequing|checking|interac|scotia/.test(name)) return byKey((a) => a.account_group === "cash_bank" && /chequing/.test(a.key));
  return null;
}

/** "Scotiabank Scene+ Visa" → "Scene+ Visa", "Costco CIBC Mastercard" → "Costco CIBC". */
export const shortAccount = (name: string) => name.replace(/^Scotiabank\s+/, "").replace(/\s+Mastercard$/, "");

/** The notification after a purchase is saved. It shows the amount (owner's choice for this one). */
export function addedNotice(p: { cents: number; merchant: string; category: string | null; account: string }) {
  const amount = `$${(p.cents / 100).toFixed(2)}`;
  return {
    title: `Added ${amount} · ${p.merchant}`,
    body: p.category ? `${p.category} · ${shortAccount(p.account)}. Tap to change.` : `No category yet · ${shortAccount(p.account)}. Tap to pick one.`,
  };
}
