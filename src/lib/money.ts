/**
 * Money is always integer cents (CAD). Never use floats for stored amounts.
 * Sign convention: negative = money out / card purchase, positive = money in.
 */
export type Cents = number;

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const cadWhole = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Expected integer cents, got ${value}`);
  }
}

/** "$1,234.56"; negative shows as "−$1,234.56" (true minus sign). */
export function formatCents(
  cents: Cents,
  opts: { whole?: boolean; signed?: boolean } = {},
): string {
  assertCents(cents);
  const abs = Math.abs(cents) / 100;
  const body = (opts.whole ? cadWhole : cad).format(abs);
  if (cents < 0) return `−${body}`;
  if (opts.signed && cents > 0) return `+${body}`;
  return body;
}

/**
 * Parse user / statement input into cents without float drift.
 * Accepts "1,234.5", "$12", "-3.07", "(45.00)" (accounting negative), "12.345" is rejected.
 */
export function parseToCents(input: string): Cents {
  let s = input.trim().replace(/[$\s,]/g, "").replace(/−/g, "-");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new RangeError(`Not a money amount: "${input}"`);
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  assertCents(cents);
  return negative ? -cents : cents;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  return total;
}

/**
 * Split a total into parts by ratio, distributing leftover cents so the parts
 * always add up exactly (used for splits and "friend owes 50%").
 */
export function allocateCents(total: Cents, ratios: readonly number[]): Cents[] {
  assertCents(total);
  if (ratios.length === 0 || ratios.some((r) => r < 0)) {
    throw new RangeError("Ratios must be a non-empty list of non-negative numbers");
  }
  const sum = ratios.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new RangeError("Ratios must not all be zero");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = ratios.map((r) => (abs * r) / sum);
  const parts = raw.map(Math.floor);
  let remainder = abs - parts.reduce((a, b) => a + b, 0);
  // Give leftover cents to the largest fractional parts first (stable order).
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    parts[order[k].i] += 1;
  }
  return parts.map((p) => p * sign);
}
