/**
 * Loads the prepared starting data (data/seed/*, git-ignored) into Supabase
 * for one user. Uses the secret key, so it only ever runs on this machine.
 *
 *   npm run seed -- --email=you@example.com          # refuses if data exists
 *   npm run seed -- --email=you@example.com --reset  # wipes that user's data first
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseCsvObjects } from "../src/lib/csv.ts";
import { formatCents, parseToCents } from "../src/lib/money.ts";

// ── args & env ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const email = (args.find((a) => a.startsWith("--email="))?.split("=")[1] ?? process.env.SEED_USER_EMAIL ?? "").trim();
const reset = args.includes("--reset");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
if (!email) fail("Pass --email=<your login email> (or set SEED_USER_EMAIL)");

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// ── seed files ──────────────────────────────────────────────────────────
type SeedCategory = { parent: string; sub: string; essential: "" | "F" | "V" | "I" | "T" | "R" | "A" };
type SeedAccount = {
  key: string; name: string; group: string; institution?: string; last4?: string;
  limit?: number; apr?: number; hidden?: boolean; balance?: number | null; as_of?: string;
  currency?: string; balance_inr?: number; implied_rate_inr_per_cad?: number; emi_cad?: number; _note?: string;
};
type SeedAccountsFile = {
  accounts: SeedAccount[];
  income: { employer: string; net_paycheque: number; anchor_payday: string; holiday_rule: string };
  reconciliations: { account: string; note: string }[];
};

const categories = JSON.parse(readFileSync("data/seed/categories.json", "utf8")) as Record<string, SeedCategory>;
const accountsFile = JSON.parse(readFileSync("data/seed/accounts.json", "utf8")) as SeedAccountsFile;
const txRows = parseCsvObjects(readFileSync("data/seed/transactions.csv", "utf8"));

// Look of each parent category: color + lucide icon. Subs inherit the color.
const PARENT_STYLE: Record<string, [color: string, icon: string]> = {
  Housing: ["#7C9CFF", "house"],
  Bills: ["#4FD1C5", "smartphone"],
  Car: ["#F6AD55", "car"],
  "Debt payments": ["#A0AEC0", "landmark"],
  Food: ["#B6FF3B", "utensils"],
  Health: ["#FC8181", "heart-pulse"],
  Subscriptions: ["#B794F4", "repeat"],
  "Personal care": ["#F687B3", "scissors"],
  Home: ["#68D391", "sofa"],
  Shopping: ["#F6E05E", "shopping-bag"],
  Fun: ["#ED64A6", "gamepad-2"],
  "Career & admin": ["#90CDF4", "briefcase"],
  Gifts: ["#FBB6CE", "gift"],
  Travel: ["#63B3ED", "plane"],
  Misc: ["#718096", "circle-help"],
  Income: ["#48BB78", "banknote"],
  Transfer: ["#A0AEC0", "arrow-left-right"],
  Reimbursement: ["#38B2AC", "hand-coins"],
  Family: ["#F6AD55", "hand-coins"],
  Adjustments: ["#718096", "scale"],
};
const SUB_ICON: Record<string, string> = {
  rent: "house", phone: "smartphone", car_ins: "shield-check", student_loan: "graduation-cap",
  groceries: "shopping-basket", fuel: "fuel", car_maint: "wrench", tolls: "square-parking",
  health: "pill", cc_interest: "percent", affirm: "calendar-clock", eating_out: "utensils",
  gym: "dumbbell", subs: "repeat", haircut: "scissors", household: "spray-can", home: "sofa",
  shopping: "shirt", online: "package", entertainment: "gamepad-2", career: "briefcase",
  gifts_given: "gift", travel: "plane", misc: "circle-dot", salary: "banknote", side: "car-front",
  benefits: "landmark", gift_in: "gift", income_other: "plus-circle", cc_payment: "credit-card",
  savings_xfer: "piggy-bank", friend_payback: "hand-coins", unknown: "circle-help",
  family_india: "hand-coins", toiletries: "spray-can", gic: "landmark", adjustment: "scale",
};

function kindOf(e: SeedCategory["essential"]) {
  return e === "I" ? "income" : e === "T" ? "transfer" : e === "R" ? "reimbursement" : e === "A" ? "adjustment" : "expense";
}
function essentialOf(e: SeedCategory["essential"]) {
  return e === "F" ? "fixed" : e === "V" ? "variable" : null;
}
const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const cents = (n: number) => parseToCents(n.toFixed(2));

// ── run ─────────────────────────────────────────────────────────────────
const userId = await findUserId(email);
console.log(`Seeding for ${email} (${userId})${reset ? " with --reset" : ""}`);

const { count } = await db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId);
if (count && !reset) fail(`This user already has ${count} transactions. Re-run with --reset to wipe and reload.`);
if (reset) await wipe(userId);

// categories: parents, then subs
const parentNames = [...new Set(Object.values(categories).map((c) => c.parent))];
const parents = must(
  await db.from("categories").insert(
    parentNames.map((name, i) => {
      const first = Object.values(categories).find((c) => c.parent === name)!;
      const [color, icon] = PARENT_STYLE[name] ?? ["#718096", "circle"];
      return { user_id: userId, key: `p_${slug(name)}`, name, kind: kindOf(first.essential), color, icon, sort_order: i };
    }),
  ).select("id,name"),
);
const parentId = new Map(parents.map((p) => [p.name, p.id]));
const subs = must(
  await db.from("categories").insert(
    Object.entries(categories).map(([key, c], i) => ({
      user_id: userId,
      key,
      parent_id: parentId.get(c.parent),
      name: c.sub,
      kind: kindOf(c.essential),
      essential: essentialOf(c.essential),
      color: (PARENT_STYLE[c.parent] ?? ["#718096"])[0],
      icon: SUB_ICON[key] ?? "circle",
      sort_order: i,
    })),
  ).select("id,key"),
);
const categoryId = new Map(subs.map((c) => [c.key, c.id]));

// accounts + anchor snapshots (signed: debts are negative)
const accountRows = must(
  await db.from("accounts").insert(
    accountsFile.accounts.map((a, i) => ({
      user_id: userId,
      key: a.key,
      name: a.name,
      account_group: a.group,
      institution: a.institution ?? null,
      last4: a.last4 ?? null,
      credit_limit_cents: a.limit != null ? cents(a.limit) : null,
      apr: a.apr ?? null,
      currency: a.currency === "INR" ? "INR" : "CAD",
      hidden: a.hidden ?? false,
      monthly_payment_cents: a.emi_cad != null ? cents(a.emi_cad) : null,
      sort_order: i,
      note: a._note ?? null,
    })),
  ).select("id,key"),
);
const accountId = new Map(accountRows.map((a) => [a.key, a.id]));

const reconNote = new Map(accountsFile.reconciliations.map((r) => [r.account, r.note]));
must(
  await db.from("balance_snapshots").insert(
    accountsFile.accounts
      .filter((a) => a.balance != null && a.as_of)
      .map((a) => {
        const isDebt = a.group.startsWith("debt_");
        return {
          user_id: userId,
          account_id: accountId.get(a.key),
          as_of: a.as_of,
          amount_cents: (isDebt ? -1 : 1) * cents(a.balance!),
          native_amount: a.balance_inr != null ? -a.balance_inr : null,
          fx_rate: a.implied_rate_inr_per_cad ?? null,
          kind: reconNote.has(a.key) ? "reconcile" : "opening",
          note: reconNote.get(a.key) ?? null,
        };
      }),
  ).select("id"),
);

// income settings
const inc = accountsFile.income;
must(
  await db.from("income_settings").upsert({
    user_id: userId,
    employer: inc.employer,
    net_paycheque_cents: cents(inc.net_paycheque),
    anchor_payday: inc.anchor_payday,
    holiday_rule: inc.holiday_rule,
  }).select("user_id"),
);

// transactions
const [imp] = must(
  await db.from("imports").insert({
    user_id: userId, file_name: "data/seed/transactions.csv", source: "seed",
    row_count: txRows.length, imported_count: txRows.length, status: "committed",
  }).select("id"),
);

// Payments that are spending AND reduce a debt (§3.2).
// The student loan is tracked by its category (EMI portion only), not by linking whole transfers.
const PAYS: Record<string, string> = { affirm: "affirm" };

const txs = txRows.map((r, i) => {
  const acc = accountId.get(r.account);
  if (!acc) fail(`Row ${i + 2}: unknown account "${r.account}"`);
  if (r.category_key && !categoryId.has(r.category_key)) fail(`Row ${i + 2}: unknown category "${r.category_key}"`);
  return {
    user_id: userId,
    account_id: acc,
    date: r.date,
    posted_date: r.posted || null,
    amount_cents: parseToCents(r.amount),
    description: r.description,
    category_id: r.category_key && !r.splits ? categoryId.get(r.category_key) : null,
    note: r.note || null,
    source: "seed",
    import_id: imp.id,
    report_date: r.report_date || null,
    in_reports: r.in_reports === "True",
    is_transfer: r.essential === "T",
    pays_account_id: PAYS[r.category_key] ? accountId.get(PAYS[r.category_key]) : null,
  };
});
const plain = txs.filter((_, i) => !txRows[i].splits);
for (let i = 0; i < plain.length; i += 500) {
  must(await db.from("transactions").insert(plain.slice(i, i + 500)).select("id"));
}
// Split rows: insert one by one so each split knows its parent id.
let splitCount = 0;
for (const [i, r] of txRows.entries()) {
  if (!r.splits) continue;
  const [tx] = must(await db.from("transactions").insert(txs[i]).select("id"));
  const parts = r.splits.split("|").map((p) => {
    // "key:amount" or "key:amount@report-date"
    const [key, rest] = p.split(":");
    const [amount, reportDate] = rest.split("@");
    if (!categoryId.has(key)) fail(`Row ${i + 2}: unknown split category "${key}"`);
    return {
      user_id: userId, transaction_id: tx.id, category_id: categoryId.get(key),
      amount_cents: parseToCents(amount), report_date: reportDate ?? null,
    };
  });
  const sum = parts.reduce((t, p) => t + p.amount_cents, 0);
  if (sum !== txs[i].amount_cents) fail(`Row ${i + 2}: splits add up to ${sum}, not ${txs[i].amount_cents}`);
  must(await db.from("transaction_splits").insert(parts).select("id"));
  splitCount += parts.length;
}

// Known upcoming payments (owner-confirmed, §3.2 / §7.7)
const chq = accountId.get("scotia_chequing");
const bills = [
  { name: "Remitly to India", note: "EMI $510 + $40 home", account: chq, cat: "student_loan", amount: -55_000, cadence: "monthly", next: "2026-11-10" },
  { name: "Car insurance", note: "Triangle", account: accountId.get("triangle"), cat: "car_ins", amount: -27_958, cadence: "monthly", next: "2026-11-14" },
  { name: "Affirm", note: "Final payment", account: chq, pays: "affirm", cat: "affirm", amount: -2_490, cadence: "once", next: "2026-11-16" },
  { name: "Affirm", note: "Final payment", account: chq, pays: "affirm", cat: "affirm", amount: -10_104, cadence: "once", next: "2026-11-20" },
  { name: "Rogers", note: "Phone & internet", account: accountId.get("triangle"), cat: "phone", amount: -13_223, cadence: "once", next: "2026-11-20" },
  { name: "Rogers", note: "New plan", account: accountId.get("triangle"), cat: "phone", amount: -10_500, cadence: "monthly", next: "2026-12-20" },
  { name: "Affirm walk pad", note: "6 × $50", account: chq, pays: "affirm_walkpad", cat: "affirm", amount: -5_000, cadence: "monthly", next: "2026-11-30", end: "2027-04-30" },
  { name: "Rent", note: "Incl. utilities", account: chq, cat: "rent", amount: -70_000, cadence: "monthly", next: "2026-12-01" },
];
must(
  await db.from("recurring_series").insert(
    bills.map((b) => ({
      user_id: userId, name: b.name, note: b.note, account_id: b.account,
      pays_account_id: b.pays ? accountId.get(b.pays) : null, category_id: categoryId.get(b.cat),
      amount_cents: b.amount, cadence: b.cadence, next_date: b.next, end_date: b.end ?? null,
    })),
  ).select("id"),
);

// Budget lines (owner's plan, Nov 8 2026; fixed amounts from statements).
const LINES: { key: string; name: string; kind: "fixed" | "variable"; cents: number; icon: string; color: string; cats: string[] }[] = [
  { key: "rent", name: "Rent", kind: "fixed", cents: 70_000, icon: "house", color: "#7C9CFF", cats: ["rent"] },
  { key: "loan", name: "Student loan EMI", kind: "fixed", cents: 51_000, icon: "graduation-cap", color: "#A0AEC0", cats: ["student_loan"] },
  { key: "home", name: "Send home (India)", kind: "fixed", cents: 4_000, icon: "hand-coins", color: "#F6AD55", cats: ["family_india"] },
  { key: "car_ins", name: "Car insurance", kind: "fixed", cents: 27_958, icon: "shield-check", color: "#F6AD55", cats: ["car_ins"] },
  { key: "phone", name: "Phone & internet", kind: "fixed", cents: 10_500, icon: "smartphone", color: "#4FD1C5", cats: ["phone"] },
  { key: "subs", name: "Subscriptions", kind: "fixed", cents: 6_718, icon: "repeat", color: "#B794F4", cats: ["subs"] },
  { key: "affirm", name: "Affirm", kind: "fixed", cents: 5_000, icon: "calendar-clock", color: "#A0AEC0", cats: ["affirm"] },
  // Estimate until the Nov 19–20 statements: Triangle $5,670 × 21.99%/12 + CIBC $2,730 × 21.75%/12.
  { key: "interest", name: "Card interest", kind: "fixed", cents: 15_338, icon: "percent", color: "#FC8181", cats: ["cc_interest"] },
  { key: "groceries", name: "Groceries", kind: "variable", cents: 30_000, icon: "shopping-basket", color: "#B6FF3B", cats: ["groceries"] },
  { key: "eating", name: "Eating out & other", kind: "variable", cents: 30_000, icon: "utensils", color: "#F6E05E", cats: ["eating_out", "misc", "unknown", "career", "gifts_given"] },
  { key: "gas", name: "Gas & car", kind: "variable", cents: 10_000, icon: "fuel", color: "#F6AD55", cats: ["fuel", "tolls", "car_maint"] },
  { key: "shopping", name: "Shopping & personal care", kind: "variable", cents: 10_000, icon: "shopping-bag", color: "#F687B3", cats: ["shopping", "online", "haircut", "toiletries", "household", "home", "health"] },
  { key: "fun", name: "Fun", kind: "variable", cents: 20_000, icon: "gamepad-2", color: "#ED64A6", cats: ["entertainment", "travel", "gym"] },
];
const lineRows = must(
  await db.from("budget_lines").insert(
    LINES.map((l, i) => ({ user_id: userId, key: l.key, name: l.name, kind: l.kind, default_cents: l.cents, icon: l.icon, color: l.color, sort_order: i })),
  ).select("id,key"),
);
const lineId = new Map(lineRows.map((l) => [l.key, l.id]));
must(
  await db.from("budget_line_categories").insert(
    LINES.flatMap((l) => l.cats.map((c) => {
      if (!categoryId.has(c)) fail(`Budget line ${l.key}: unknown category ${c}`);
      return { user_id: userId, line_id: lineId.get(l.key), category_id: categoryId.get(c) };
    })),
  ).select("line_id"),
);
// November 2026: Affirm's two final payments ($24.90 + $101.04) + first walk pad payment ($50).
must(
  await db.from("budgets").insert([
    { user_id: userId, line_id: lineId.get("affirm"), month: "2026-11-01", amount_cents: 17_594, note: "Final Sep-plan payments + first walk pad payment" },
    { user_id: userId, line_id: lineId.get("phone"), month: "2026-11-01", amount_cents: 13_223, note: "Old plan; $105 from December" },
  ]).select("id"),
);

// Profile: greeting + headline monthly budget (owner: keep it at a round $3,000).
must(await db.from("profiles").upsert({ user_id: userId, display_name: "Vikram", monthly_budget_cents: 300_000 }).select("user_id"));

// Money friends owe (owner, Nov 8 2026): food, split across eating out/groceries unknown.
must(
  await db.from("shared_debts").insert({
    user_id: userId, person: "Friend", amount_cents: 34_000, note: "Food (eating out + groceries, split unknown)",
  }).select("id"),
);

// ── report ──────────────────────────────────────────────────────────────
const balances = must(
  await db.from("account_balances").select("key,name,account_group,balance_cents,anchor_date")
    .eq("user_id", userId).neq("account_group", "legacy"),
);
console.log(`\n✓ ${subs.length} categories, ${accountRows.length} accounts, ${txs.length} transactions (${splitCount} split lines), ${LINES.length} budget lines\n`);
for (const b of balances) {
  console.log(`  ${b.name.padEnd(28)} ${formatCents(Number(b.balance_cents)).padStart(12)}   (anchor ${b.anchor_date})`);
}

// ── helpers ─────────────────────────────────────────────────────────────
async function findUserId(addr: string): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) fail(error.message);
  const user = data.users.find((u) => u.email?.toLowerCase() === addr.toLowerCase());
  if (!user) fail(`No auth user with email ${addr}. Create it in Supabase → Authentication → Users first.`);
  return user.id;
}

async function wipe(uid: string) {
  // Children before parents, so FKs with "restrict" never block.
  for (const t of [
    "budgets", "budget_line_categories", "budget_lines", "recurring_series", "shared_debts", "transaction_splits", "paycheques", "transactions", "imports", "rules",
    "merchants", "budgets", "savings_goals", "balance_snapshots", "accounts",
  ]) {
    must(await db.from(t).delete().eq("user_id", uid).select("user_id"));
  }
  must(await db.from("categories").delete().eq("user_id", uid).not("parent_id", "is", null).select("id"));
  must(await db.from("categories").delete().eq("user_id", uid).select("id"));
  must(await db.from("income_settings").delete().eq("user_id", uid).select("user_id"));
  must(await db.from("profiles").delete().eq("user_id", uid).select("user_id"));
  console.log("  wiped existing data");
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) fail(res.error.message);
  return res.data as T;
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
