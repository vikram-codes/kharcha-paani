/**
 * Statement parsers for the owner's 4 accounts (ported from tools/seed/parse_statements.py).
 * Input: layout text of a PDF statement (see pdf-text.ts). Output: normalized rows
 * (amount < 0 = money out / card purchase) plus checks against the statement's own
 * totals, so an import is only trusted when it adds up exactly.
 */
import { parseToCents } from "../money.ts";

export type StatementSource = "scotia_chequing" | "scotia_visa" | "cibc_costco" | "triangle";

export type ParsedRow = { date: string; posted: string | null; amount_cents: number; description: string };
export type Check = { name: string; got: number; want: number; ok: boolean };
export type ParsedStatement = {
  source: StatementSource;
  /** The statement's closing date (YYYY-MM-DD), the last day it covers. */
  periodEnd: string | null;
  /** Card statements: when payment is due and how much (cents, positive = owed). */
  payment: { dueDate: string; balanceCents: number | null; minimumCents: number | null } | null;
  rows: ParsedRow[];
  checks: Check[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
const AMT = "-?[\\d,]+\\.\\d\\d";
const cents = (s: string) => parseToCents(s.replace(/[$,]/g, ""));
const monthIndex = (m: string) => MONTHS.indexOf(m.slice(0, 3).toLowerCase());
const squash = (s: string) => s.replace(/\s{2,}/g, " ").trim();

/** Latest "Month D, YYYY" in the text = end of the statement period. */
function findPeriodEnd(text: string): { y: number; m: number; iso: string } | null {
  let best: { y: number; m: number; d: number } | null = null;
  for (const x of text.matchAll(new RegExp(`\\b${MON}\\s+(\\d{1,2}),?\\s+(20\\d\\d)\\b`, "gi"))) {
    const m = monthIndex(x[1]);
    const d = Number(x[2]);
    const y = Number(x[3]);
    if (m < 0 || d < 1 || d > 31) continue;
    if (!best || y * 10_000 + m * 100 + d > best.y * 10_000 + best.m * 100 + best.d) best = { y, m, d };
  }
  if (!best) return null;
  return { y: best.y, m: best.m, iso: `${best.y}-${String(best.m + 1).padStart(2, "0")}-${String(best.d).padStart(2, "0")}` };
}

const DATE = `(${MON})\\s+(\\d{1,2}),?\\s+(20\\d\\d)`;
/** The first "Month D, YYYY" right after `label` (spaces and line breaks between are fine). */
function dateAfter(text: string, label: string): string | null {
  const m = new RegExp(`${label}\\s+${DATE}`, "i").exec(text);
  if (!m) return null;
  const mon = monthIndex(m[1]);
  // MON has its own group, so: [1] month word, [3] day, [4] year.
  return mon < 0 ? null : `${m[4]}-${String(mon + 1).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
}
/**
 * A dollar amount right after `label` on the same line. Spaces and symbols in
 * between are skipped ("New Balance‡ = $467.33"), words aren't. "CR" after it
 * means a credit (you're owed).
 */
function amountAfter(text: string, label: string): number | null {
  const m = new RegExp(`${label}[^\\w$\\n]{0,80}\\$\\s*([\\d,]+\\.\\d\\d)(\\s*CR)?`, "i").exec(text);
  return m ? cents(m[1]) * (m[2] ? -1 : 1) : null;
}

/**
 * Closing date and payment due (owner, Nov 11 2026). The latest date in a
 * card statement is its payment due date, not the day it closed, so the
 * labels are read instead.
 */
function statementDates(source: StatementSource, text: string) {
  if (source === "scotia_chequing") return { closing: dateAfter(text, "Closing\\s+Balance\\s+on"), payment: null };
  const closing = dateAfter(text, "Statement\\s+date:?");
  const dueDate = source === "cibc_costco" ? dateAfter(text, "pay\\s+this\\s+amount\\s+by") : dateAfter(text, "Payment\\s+due\\s+date:?");
  const balanceCents =
    source === "triangle"
      ? amountAfter(text, "Balance\\s+Due")
      : source === "cibc_costco"
        ? amountAfter(text, "Total\\s+balance")
        : amountAfter(text, "New\\s+Balance");
  const minimumCents = amountAfter(text, "Minimum\\s+payment(?:\\s+due)?");
  return { closing, payment: dueDate ? { dueDate, balanceCents, minimumCents } : null };
}

/** "Oct", "5" → ISO date, placing December rows of a January statement in the previous year. */
function dateIn(end: { y: number; m: number }, mon: string, day: string): string {
  const m = monthIndex(mon);
  const y = m > end.m ? end.y - 1 : end.y;
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

const check = (name: string, got: number, want: number): Check => ({ name, got, want, ok: got === want });

// ───────────────────────────── detection ─────────────────────────────

export function detectStatement(text: string): StatementSource | null {
  if (/Triangle|Canadian Tire Bank|CTFS/i.test(text) && /Your New Balance/i.test(text)) return "triangle";
  if (/CIBC/i.test(text) && /Previous balance/i.test(text)) return "cibc_costco";
  if (/SUB-TOTAL DEBITS/i.test(text)) return "scotia_visa";
  if (/Opening Balance on/i.test(text) && /Closing Balance on/i.test(text)) return "scotia_chequing";
  return null;
}

export function parseStatement(text: string): ParsedStatement {
  const source = detectStatement(text);
  if (!source) throw new Error("This doesn't look like a Scotiabank, CIBC or Triangle statement.");
  const end = findPeriodEnd(text);
  if (!end) throw new Error("Couldn't find the statement dates.");
  const parsed = { scotia_chequing, scotia_visa, cibc_costco, triangle }[source](text, end);
  const { closing, payment } = statementDates(source, text);
  return { source, periodEnd: closing ?? end.iso, payment, ...parsed };
}

// ───────────────────────────── Scotiabank chequing ─────────────────────────────
// Lines: "Sep 8   Point of sale purchase   206.88   2,000.00" + a detail line below.
// The sign isn't printed: it comes from the running balance.

function scotia_chequing(text: string, end: { y: number; m: number }) {
  const lines = text.split("\n");
  const opening = /Opening Balance on [^$\n]*\$\s*([\d,]+\.\d\d)/i.exec(text);
  const closing = /Closing Balance on [^$\n]*\$\s*([\d,]+\.\d\d)/i.exec(text);
  if (!opening || !closing) throw new Error("Chequing statement: opening/closing balance not found.");
  let prev = cents(opening[1]);
  const rows: ParsedRow[] = [];
  // A short margin mark ("01 -", "-") can precede the date; the running balance
  // check below rejects anything that isn't really a transaction.
  const re = new RegExp(`^(?:\\s*\\S{1,4}(?:\\s+\\S{1,2})?)?\\s*${MON} (\\d{1,2})\\s{2,}(\\S.*?)\\s{2,}(${AMT})\\s+(${AMT})\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m || /Opening Balance/i.test(lines[i])) continue;
    const [, mon, day, kind, amtS, balS] = m;
    const amt = cents(amtS);
    const bal = cents(balS);
    const signed = prev + amt === bal ? amt : prev - amt === bal ? -amt : null;
    if (signed === null) continue; // not a transaction line (balance doesn't follow)
    prev = bal;
    let detail = "";
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const t = lines[j].trim();
      if (!t || /^\d{5,6}$|^\*\w+\*$|^SBSAV|^continued|^Page/i.test(t)) continue;
      if (re.test(lines[j])) break;
      detail = squash(t);
      break;
    }
    rows.push({ date: dateIn(end, mon, day), posted: null, amount_cents: signed, description: squash(`${kind} | ${detail}`).replace(/ \|$/, "") });
  }
  const sum = rows.reduce((t, r) => t + r.amount_cents, 0);
  return { rows, checks: [check("Opening + transactions = closing", cents(opening[1]) + sum, cents(closing[1]))] };
}

// ───────────────────────────── Scotiabank Scene+ Visa ─────────────────────────────
// "001   Oct 3   Oct 4   UBER CANADA/UBERONEMEM TORONTO ON   5.64"  (credits end in "-")

function scotia_visa(text: string, end: { y: number; m: number }) {
  const rows: ParsedRow[] = [];
  const re = new RegExp(`^\\s*(\\d{3})\\s+${MON} (\\d{1,2})\\s+${MON} (\\d{1,2})\\s+(.+?)\\s{2,}(${AMT})\\s?(-?)\\s*$`, "gm");
  for (const m of text.matchAll(re)) {
    const [, , tm, td, pm, pd, desc, amt, credit] = m;
    const a = cents(amt);
    rows.push({ date: dateIn(end, tm, td), posted: dateIn(end, pm, pd), amount_cents: credit ? a : -a, description: squash(desc) });
  }
  const debits = /SUB-TOTAL DEBITS[^$\n]*\$\s*([\d,]+\.\d\d)/i.exec(text);
  const credits = /SUB-TOTAL CREDITS[^$\n]*\$\s*([\d,]+\.\d\d)/i.exec(text);
  const checks: Check[] = [];
  if (debits) checks.push(check("Purchases = statement debits", -rows.filter((r) => r.amount_cents < 0).reduce((t, r) => t + r.amount_cents, 0), cents(debits[1])));
  if (credits) checks.push(check("Payments = statement credits", rows.filter((r) => r.amount_cents > 0).reduce((t, r) => t + r.amount_cents, 0), cents(credits[1])));
  if (!checks.length) checks.push(check("Statement totals found", 0, 1));
  return { rows, checks };
}

// ───────────────────────────── CIBC Costco Mastercard ─────────────────────────────
// "Oct 10   Oct 13   TST-India Paradise Lon London ON   Restaurants   74.58"

function cibc_costco(text: string, end: { y: number; m: number }) {
  const rows: ParsedRow[] = [];
  const re = new RegExp(`^\\s*${MON} (\\d{1,2})\\s+${MON} (\\d{1,2})\\s+(?:Ý\\s*)?(.+?)\\s{2,}(${AMT})\\s*$`, "gm");
  for (const m of text.matchAll(re)) {
    const [, tm, td, pm, pd, descRaw, amt] = m;
    const desc = squash(descRaw);
    const a = cents(amt);
    const payment = /PAYMENT THANK YOU/i.test(desc);
    rows.push({ date: dateIn(end, tm, td), posted: dateIn(end, pm, pd), amount_cents: payment ? a : -a, description: desc });
  }
  const total = /Total balance\s*=?\s*\$\s*([\d,]+\.\d\d)/i.exec(text);
  const prev = /Previous balance\s*\$\s*([\d,]+\.\d\d)/i.exec(text);
  if (!total || !prev) return { rows, checks: [check("Statement totals found", 0, 1)] };
  const sum = rows.reduce((t, r) => t + r.amount_cents, 0);
  return { rows, checks: [check("Previous balance − transactions = new balance", cents(prev[1]) - sum, cents(total[1]))] };
}

// ───────────────────────────── Triangle Mastercard ─────────────────────────────
// "Aug 18   Aug 19   DOLLARAMA # 336 LONDON ON   34.48"  (payments printed negative)

function triangle(text: string, end: { y: number; m: number }) {
  const rows: ParsedRow[] = [];
  const re = new RegExp(`^\\s*${MON} (\\d{1,2})\\s+${MON} (\\d{1,2})\\s+(.+?)\\s{2,}(${AMT})(?=\\s{2,}|\\s*$)`, "gm");
  for (const m of text.matchAll(re)) {
    const [, tm, td, pm, pd, descRaw, amt] = m;
    if (/^\d+\s+\d{4}\s/.test(descRaw)) continue; // Canadian Tire item-detail lines ("1 9619 BOSCH SPK PLG")
    rows.push({ date: dateIn(end, tm, td), posted: dateIn(end, pm, pd), amount_cents: -cents(amt), description: squash(descRaw) });
  }
  const prev = /Balance from your last statement\s*\$\s*([\d,]+\.\d\d)/i.exec(text);
  const next = /Your New Balance\s*\$\s*([\d,]+\.\d\d)/i.exec(text);
  if (!prev || !next) return { rows, checks: [check("Statement totals found", 0, 1)] };
  const sum = rows.reduce((t, r) => t + r.amount_cents, 0);
  return { rows, checks: [check("Previous balance − transactions = new balance", cents(prev[1]) - sum, cents(next[1]))] };
}
