/**
 * Duplicate detection for imports (§4.3 step 2). Each incoming row is compared
 * with what's already saved on the same account:
 *  - "duplicate": same date + amount + (roughly) same description → skip
 *  - "possible":  same amount within ±3 days (e.g. you logged it by hand) → review
 *  - "new":       nothing similar → import
 * Each existing row can only explain one incoming row.
 */
export type Existing = { id: string; date: string; amount_cents: number; description: string };
export type Incoming = { date: string; amount_cents: number; description: string };
export type Match = { status: "new" | "duplicate" | "possible"; existingId?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

export function matchDuplicates(incoming: readonly Incoming[], existing: readonly Existing[]): Match[] {
  const used = new Set<string>();
  const out: Match[] = incoming.map(() => ({ status: "new" as const }));
  // Pass 1: exact duplicates.
  incoming.forEach((r, i) => {
    const hit = existing.find(
      (e) => !used.has(e.id) && e.amount_cents === r.amount_cents && e.date === r.date && (norm(e.description) === norm(r.description) || !e.description),
    );
    if (hit) {
      used.add(hit.id);
      out[i] = { status: "duplicate", existingId: hit.id };
    }
  });
  // Pass 2: same amount nearby (manual entries, pending vs posted dates).
  incoming.forEach((r, i) => {
    if (out[i].status !== "new") return;
    const hit = existing
      .filter((e) => !used.has(e.id) && e.amount_cents === r.amount_cents && days(e.date, r.date) <= 3)
      .sort((a, b) => days(a.date, r.date) - days(b.date, r.date))[0];
    if (hit) {
      used.add(hit.id);
      out[i] = { status: "possible", existingId: hit.id };
    }
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
