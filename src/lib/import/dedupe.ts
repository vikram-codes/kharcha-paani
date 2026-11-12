/**
 * Duplicate detection for imports (§4.3 step 2). Each incoming statement row is
 * compared with what's already saved on the same account:
 *  - "duplicate": same date + amount + (roughly) same description → skip
 *  - "possible":  probably something you already added (review it):
 *      "same-amount"  same amount within 5 days (pending vs posted dates too)
 *      "close-amount" an entry you added by hand within 4 days whose amount is
 *                     a little off: a tip, or a currency conversion
 *      "combined"     two entries you added by hand that add up to it exactly
 *                     (one order you entered as two items)
 *  - "new":       nothing similar → import
 * Names are compared too: an entry whose name shares a word with the statement
 * ("Emirates" / "EMIRATES 1176…") wins over one that doesn't, and one that
 * clearly names another merchant is never matched on a close amount; on the
 * exact amount it's still shown, but not assumed to be the same purchase.
 * Bank-made lines (interest, fees, payments) only match exactly.
 * Each existing row can only explain one incoming row.
 */
export type Existing = {
  id: string;
  date: string;
  amount_cents: number;
  description: string;
  source?: string;
  note?: string | null;
  /** Its description is a bank merchant string (copied in), so it names a merchant. */
  bankLike?: boolean;
};
export type Incoming = { date: string; amount_cents: number; description: string };
export type MatchKind = "same-amount" | "close-amount" | "combined";
export type Match = {
  status: "new" | "duplicate" | "possible";
  existingId?: string;
  existingIds?: string[];
  kind?: MatchKind;
  /** False when the names disagree: shown, but not assumed to be the same purchase. */
  confident?: boolean;
};

const STOP = new Set(["the", "and", "for", "with", "from", "inc", "com", "ltd", "store", "www", "ont", "can"]);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

/** Does your entry's name agree with the statement's merchant? */
export function nameAgreement(statement: string, e: Pick<Existing, "description" | "note" | "bankLike">): "agree" | "unknown" | "conflict" {
  const st = words(statement);
  for (const w of words(`${e.note ?? ""} ${e.description}`)) if (st.has(w)) return "agree";
  return e.bankLike ? "conflict" : "unknown";
}
const RANK = { agree: 0, unknown: 1, conflict: 2 } as const;

/** Lines the bank makes itself, which you wouldn't have added by hand at a different amount. */
export const isBankLine = (description: string) => /interest|finance charge|\bfee\b|payment|transfer|deposit|payroll|credit adj/i.test(description);

export const SAME_AMOUNT_DAYS = 5;
export const CLOSE_AMOUNT_DAYS = 4;
/** How far a hand-entered amount may be from the statement: $3, or 25% for bigger amounts. */
export const closeEnough = (statement: number, mine: number) =>
  Math.sign(statement) === Math.sign(mine) && Math.abs(statement - mine) <= Math.max(300, Math.abs(statement) * 0.25);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const byHand = (e: Existing) => e.source === "manual" || e.source === "mcp";

export function matchDuplicates(incoming: readonly Incoming[], existing: readonly Existing[]): Match[] {
  const used = new Set<string>();
  const out: Match[] = incoming.map(() => ({ status: "new" as const }));
  const open = (e: Existing) => !used.has(e.id);
  const take = (i: number, ids: string[], kind?: MatchKind, confident = true) => {
    ids.forEach((id) => used.add(id));
    out[i] = kind ? { status: "possible", existingId: ids[0], existingIds: ids, kind, confident } : { status: "duplicate", existingId: ids[0], existingIds: ids };
  };
  const agree = (r: Incoming, e: Existing) => nameAgreement(r.description, e);
  const pending = (fn: (r: Incoming, i: number) => void) => incoming.forEach((r, i) => out[i].status === "new" && fn(r, i));

  // 1. Exact duplicates.
  pending((r, i) => {
    const hit = existing.find((e) => open(e) && e.amount_cents === r.amount_cents && e.date === r.date && (norm(e.description) === norm(r.description) || !e.description));
    if (hit) take(i, [hit.id]);
  });
  // 2. Same amount nearby: names that agree first, then the closest date.
  pending((r, i) => {
    const hit = existing
      .filter((e) => open(e) && e.amount_cents === r.amount_cents && days(e.date, r.date) <= SAME_AMOUNT_DAYS)
      .sort((a, b) => RANK[agree(r, a)] - RANK[agree(r, b)] || days(a.date, r.date) - days(b.date, r.date))[0];
    if (hit) take(i, [hit.id], "same-amount", agree(r, hit) !== "conflict");
  });
  // 3. A hand-entered amount that's a little off (tip, exchange rate).
  pending((r, i) => {
    if (isBankLine(r.description)) return;
    const hit = existing
      .filter((e) => open(e) && byHand(e) && agree(r, e) !== "conflict" && days(e.date, r.date) <= CLOSE_AMOUNT_DAYS && closeEnough(r.amount_cents, e.amount_cents))
      .sort(
        (a, b) =>
          RANK[agree(r, a)] - RANK[agree(r, b)] ||
          days(a.date, r.date) - days(b.date, r.date) ||
          Math.abs(a.amount_cents - r.amount_cents) - Math.abs(b.amount_cents - r.amount_cents),
      )[0];
    if (hit) take(i, [hit.id], "close-amount");
  });
  // 4. Two hand entries (within a day of each other) that add up exactly.
  pending((r, i) => {
    if (isBankLine(r.description)) return;
    const near = existing.filter(
      (e) => open(e) && byHand(e) && agree(r, e) !== "conflict" && Math.sign(e.amount_cents) === Math.sign(r.amount_cents) && days(e.date, r.date) <= SAME_AMOUNT_DAYS,
    );
    for (let a = 0; a < near.length; a++)
      for (let b = a + 1; b < near.length; b++)
        if (near[a].amount_cents + near[b].amount_cents === r.amount_cents && days(near[a].date, near[b].date) <= 1) return take(i, [near[a].id, near[b].id], "combined");
  });
  return out;
}

/** Stable id for a statement row, so the same file can't be imported twice. */
export function fingerprint(r: Incoming, occurrence: number): string {
  return `${r.date}|${r.amount_cents}|${norm(r.description)}|${occurrence}`;
}

/** Fingerprints for a batch: identical same-day rows get occurrence 0, 1, 2… */
export function fingerprints(rows: readonly Incoming[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = fingerprint(r, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return fingerprint(r, n);
  });
}

/**
 * Category from how you filed this merchant before: the most common category
 * among past transactions with the same merchant and direction, when it's
 * clearly the usual one (at least 60% of them).
 */
export type PastRow = { key: string; amount_cents: number; categoryId: string };
export function historyCategories(past: readonly PastRow[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const p of past) {
    if (!p.key) continue;
    const k = `${Math.sign(p.amount_cents)}|${p.key}`;
    const m = counts.get(k) ?? new Map<string, number>();
    m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
    counts.set(k, m);
  }
  return (key: string, amountCents: number): string | null => {
    const m = counts.get(`${Math.sign(amountCents)}|${key}`);
    if (!m) return null;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [best, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return n / total >= 0.6 ? best : null;
  };
}
