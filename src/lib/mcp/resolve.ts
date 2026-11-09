/**
 * Turn what the owner (or Claude) calls things into ids. Never guesses between
 * two plausible matches: returns the options instead, so Claude can ask.
 */
export type Named = { id: string; name: string; parent?: string | null; key?: string | null };
export type Resolved = { ok: true; id: string; name: string } | { ok: false; options: string[] };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

export function resolveName(input: string, items: readonly Named[]): Resolved {
  const q = norm(input);
  if (!q) return { ok: false, options: items.slice(0, 12).map((i) => i.name) };
  const label = (i: Named) => (i.parent ? `${i.parent} · ${i.name}` : i.name);
  const tiers: ((i: Named) => boolean)[] = [
    (i) => norm(i.name) === q || norm(label(i)) === q,
    (i) => norm(i.name).startsWith(q) || norm(i.name).split(" ").includes(q),
    (i) => norm(label(i)).includes(q) || q.split(" ").every((w) => norm(label(i)).includes(w)),
  ];
  for (const t of tiers) {
    const hits = items.filter(t);
    if (hits.length === 1) return { ok: true, id: hits[0].id, name: hits[0].name };
    if (hits.length > 1) return { ok: false, options: hits.map(label) };
  }
  return { ok: false, options: items.map(label) };
}

const ACCOUNT_ALIASES: [RegExp, RegExp][] = [
  [/\b(chequing|checking|debit|bank)\b/, /chequing/i],
  [/\b(visa|scene|scotia ?visa|scotiabank visa)\b/, /scene|visa/i],
  [/\b(cibc|costco)\b/, /cibc|costco/i],
  [/\b(triangle|canadian tire|ct)\b/, /triangle/i],
];

export function resolveAccount(input: string, accounts: readonly Named[]): Resolved {
  const q = norm(input);
  for (const [alias, target] of ACCOUNT_ALIASES) {
    if (alias.test(q)) {
      const hit = accounts.filter((a) => target.test(a.name));
      if (hit.length === 1) return { ok: true, id: hit[0].id, name: hit[0].name };
    }
  }
  return resolveName(input, accounts);
}
