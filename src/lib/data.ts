import "server-only";
import { cacheLife } from "next/cache";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { budgetBand, budgetStatus, type BudgetLineDef } from "./budget";
import { addMonths, monthKey, monthRange, todayISO, type ISODate, type MonthKey } from "./dates";
import { loanState, payoffMonth } from "./loan";
import { nextPayday, type HolidayRule } from "./paydays";
import { summarize, type CategoryInfo, type TxRow } from "./summary";

/**
 * Data Access Layer. Every read goes through here with the owner's session,
 * so RLS applies. Callers sit behind a <Suspense> boundary.
 */
async function session() {
  // Request-time only: the session, "today" and Supabase's token-expiry checks all use the clock.
  await connection();
  return authed();
}

/** For `"use cache: private"` scopes, where connection() isn't allowed. */
async function authed() {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return { db, today: todayISO() };
}

type Db = Awaited<ReturnType<typeof createClient>>;
type Res = { data: unknown; error: { message: string } | null };

/** Unwraps a Supabase response, throwing on error. `data` is non-null. */
function ok<R extends Res>(res: R): Exclude<R["data"], null> {
  if (res.error) throw new Error(res.error.message);
  return res.data as Exclude<R["data"], null>;
}

/** Same, for `.maybeSingle()` where no row is a valid answer. */
function okMaybe<R extends Res>(res: R): R["data"] {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** First month with full data in the app; earlier history is one combined Money Pro period. */
export const FIRST_MONTH: MonthKey = "2026-01";
export const HISTORY = { key: "2025", start: "2024-12-01", end: "2025-12-31", label: "2024–2025" } as const;

// ───────────────────────────── building blocks ─────────────────────────────

export type Balance = {
  account_id: string;
  key: string;
  name: string;
  account_group: string;
  hidden: boolean;
  balance_cents: number;
};

async function balances(db: Db): Promise<Balance[]> {
  return ok(
    await db.from("account_balances").select("account_id,key,name,account_group,hidden,balance_cents").neq("account_group", "legacy"),
  ).map((b) => ({
    account_id: b.account_id!,
    key: b.key!,
    name: b.name!,
    account_group: b.account_group!,
    hidden: Boolean(b.hidden),
    balance_cents: Number(b.balance_cents),
  }));
}

async function categories(db: Db): Promise<Map<string, CategoryInfo>> {
  const rows = ok(await db.from("categories").select("id,key,name,kind,essential,color,icon,parent_id"));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        key: r.key,
        name: r.name,
        parentName: r.parent_id ? (byId.get(r.parent_id)?.name ?? null) : null,
        kind: r.kind as CategoryInfo["kind"],
        essential: r.essential as CategoryInfo["essential"],
        color: r.color,
        icon: r.icon,
      } satisfies CategoryInfo,
    ]),
  );
}

/**
 * A ledger line: a transaction, or one split line of it. `date` is when it was
 * paid; `reportOn` is the month it counts toward (e.g. rent paid early).
 */
export type LedgerRow = TxRow & { id: string; date: ISODate; reportOn: ISODate; description: string; account: string; split: boolean };

const PAGE = 1000;

/** All lines that REPORT in [start, end], newest first. */
async function ledger(db: Db, start: ISODate, end: ISODate, cats: Map<string, CategoryInfo>): Promise<LedgerRow[]> {
  // Supabase returns at most 1,000 rows per request, so page through.
  const page = (from: number) =>
    db
      .from("ledger_lines")
      .select("line_id,date,report_on,description,note,amount_cents,is_transfer,in_reports,category_id,account_id,is_split")
      .gte("report_on", start)
      .lte("report_on", end)
      .order("report_on", { ascending: false })
      .order("line_id")
      .range(from, from + PAGE - 1)
      .then(ok);
  const [first, accounts] = await Promise.all([page(0), db.from("accounts").select("id,name").then(ok)]);
  const rows = [...first];
  for (let from = PAGE, last = first; last.length === PAGE; from += PAGE) {
    last = await page(from);
    rows.push(...last);
  }
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.line_id!,
    date: r.date as ISODate,
    reportOn: r.report_on as ISODate,
    description: r.is_split && r.note ? `${r.description} · ${r.note}` : (r.description ?? ""),
    account: accountName.get(r.account_id!) ?? "",
    split: Boolean(r.is_split),
    amount_cents: Number(r.amount_cents),
    is_transfer: Boolean(r.is_transfer),
    in_reports: Boolean(r.in_reports),
    category: r.category_id ? (cats.get(r.category_id) ?? null) : null,
  }));
}

const monthLedger = (db: Db, month: MonthKey, cats: Map<string, CategoryInfo>) => {
  const { start, end } = monthRange(month);
  return ledger(db, start, end, cats);
};

async function incomeSettings(db: Db) {
  const s = okMaybe(await db.from("income_settings").select("net_paycheque_cents,anchor_payday,frequency_days,holiday_rule").maybeSingle());
  if (!s) return null;
  return {
    paycheque: Number(s.net_paycheque_cents),
    plannedMonthly: 2 * Number(s.net_paycheque_cents), // always 2; a 3rd goes to savings (§7.1)
    schedule: { anchor: s.anchor_payday as ISODate, everyDays: s.frequency_days, rule: s.holiday_rule as HolidayRule },
  };
}

/** Greeting name + the headline monthly budget (a round number the owner sets). */
async function profile(db: Db) {
  const p = okMaybe(await db.from("profiles").select("display_name,monthly_budget_cents").maybeSingle());
  return { name: p?.display_name ?? null, monthlyBudget: p?.monthly_budget_cents != null ? Number(p.monthly_budget_cents) : null };
}

/** Lines that are balance adjustments, for the Adjustments card. */
function adjustmentRows(rows: readonly LedgerRow[]): CategoryTx[] {
  return rows
    .filter((r) => r.in_reports && r.category?.kind === "adjustment")
    .map((r) => ({ id: r.id, date: r.date, reportOn: r.reportOn, description: r.description, account: r.account, amount_cents: r.amount_cents, split: r.split }));
}

/** Budget lines with this month's amounts (override, else default). */
async function budgetLines(db: Db, month: MonthKey): Promise<BudgetLineDef[]> {
  const [lines, links, overrides] = await Promise.all([
    db.from("budget_lines").select("id,key,name,kind,icon,color,default_cents,sort_order").eq("active", true).order("sort_order").then(ok),
    db.from("budget_line_categories").select("line_id,category_id").then(ok),
    db.from("budgets").select("line_id,amount_cents").eq("month", `${month}-01`).then(ok),
  ]);
  const override = new Map(overrides.map((o) => [o.line_id, Number(o.amount_cents)]));
  return lines.map((l) => ({
    id: l.id,
    key: l.key,
    name: l.name,
    kind: l.kind as BudgetLineDef["kind"],
    icon: l.icon,
    color: l.color,
    budget: override.get(l.id) ?? Number(l.default_cents),
    categoryIds: links.filter((x) => x.line_id === l.id).map((x) => x.category_id),
  }));
}

function spentByCategory(rows: readonly TxRow[]) {
  return new Map(summarize(rows).expenses.map((e) => [e.category?.id ?? "__none", e.cents]));
}

export type Upcoming = { id: string; name: string; note: string | null; date: ISODate; amount_cents: number; icon: string | null; color: string | null };

/** Next occurrence (≥ today) of each active bill, soonest first (§6). */
async function upcoming(db: Db, today: ISODate, cats: Map<string, CategoryInfo>): Promise<Upcoming[]> {
  const rows = ok(
    await db.from("recurring_series").select("id,name,note,amount_cents,cadence,next_date,end_date,category_id").eq("active", true),
  );
  const out: Upcoming[] = [];
  for (const r of rows) {
    let d = r.next_date as ISODate;
    if (r.cadence === "monthly") {
      for (let i = 1; d < today; i++) d = addMonths(r.next_date, i);
    }
    if (d < today || (r.end_date && d > r.end_date)) continue;
    const c = r.category_id ? cats.get(r.category_id) : undefined;
    out.push({ id: r.id, name: r.name, note: r.note, date: d, amount_cents: Number(r.amount_cents), icon: c?.icon ?? null, color: c?.color ?? null });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const isDebt = (b: Balance) => (b.account_group === "debt_card" || b.account_group === "debt_loan") && b.key !== "student_loan";

/** Rows of a category (or uncategorized) for drill-downs, newest first. Serializable. */
export type CategoryTx = { id: string; date: ISODate; reportOn: ISODate; description: string; account: string; amount_cents: number; split: boolean };

function byCategory(rows: readonly LedgerRow[]): Record<string, CategoryTx[]> {
  const out: Record<string, CategoryTx[]> = {};
  for (const r of rows) {
    if (!r.in_reports || r.is_transfer) continue;
    const k = r.category?.id ?? "__none";
    (out[k] ??= []).push({ id: r.id, date: r.date, reportOn: r.reportOn, description: r.description, account: r.account, amount_cents: r.amount_cents, split: r.split });
  }
  return out;
}

// ───────────────────────────── screens ─────────────────────────────

export async function getHome() {
  const { db, today } = await session();
  const month = monthKey(today);
  const cats = await categories(db);
  const [bal, rows, income, bills, lines, owed, prof] = await Promise.all([
    balances(db),
    monthLedger(db, month, cats),
    incomeSettings(db),
    upcoming(db, today, cats),
    budgetLines(db, month),
    db.from("shared_debts").select("amount_cents").is("settled_at", null).then(ok),
    profile(db),
  ]);
  const { end } = monthRange(month);
  const bank = bal.filter((b) => b.account_group === "cash_bank");
  const debts = bal.filter(isDebt);
  const investments = bal.filter((b) => b.account_group === "investment");
  const status = budgetStatus(lines, spentByCategory(rows));
  const budget = prof.monthlyBudget ?? status.budget;

  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return {
    today,
    name: prof.name,
    greeting: hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    month,
    daysLeft: Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000) + 1,
    spent: status.spent,
    budget,
    band: budgetBand(status.spent, budget),
    nextPayday: income ? nextPayday(income.schedule, today).paid : null,
    cash: bank.reduce((s, b) => s + b.balance_cents, 0),
    debts: -debts.reduce((s, b) => s + b.balance_cents, 0),
    debtCounts: {
      cards: debts.filter((d) => d.account_group === "debt_card").length,
      plans: debts.filter((d) => d.account_group === "debt_loan" && d.balance_cents !== 0).length,
    },
    investments: investments.reduce((s, b) => s + b.balance_cents, 0),
    investmentCount: investments.length,
    owedToMe: owed.reduce((t, o) => t + Number(o.amount_cents), 0),
    upcoming: bills.slice(0, 3),
  };
}

/**
 * One month's summary. Cached privately (browser only, per session) so the
 * previous/next month links can prefetch it; stale after 5 minutes.
 */
export async function getMonthSummary(month: MonthKey) {
  "use cache: private";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const { db, today } = await authed();
  const cats = await categories(db);
  const prev = monthKey(addMonths(`${month}-01`, -1));
  const [rows, prevRows, lines, prof] = await Promise.all([
    monthLedger(db, month, cats),
    prev >= FIRST_MONTH ? monthLedger(db, prev, cats) : Promise.resolve([]),
    budgetLines(db, month),
    profile(db),
  ]);
  const summary = summarize(rows);
  const before = summarize(prevRows);
  const status = budgetStatus(lines, spentByCategory(rows));
  const total = prof.monthlyBudget ?? status.budget;
  return {
    month,
    isCurrent: month === monthKey(today),
    isFuture: month > monthKey(today),
    summary,
    budget: { ...status, total, band: budgetBand(status.spent, total) },
    adjustments: adjustmentRows(rows),
    previous: prevRows.length ? { spent: before.spent, income: before.income } : null,
    prevByCat: Object.fromEntries(before.expenses.map((e) => [e.category?.id ?? "__none", e.cents])),
    transactions: byCategory(rows),
  };
}

/** The Money Pro period (Dec 2024 – Dec 2025) as one detailed summary. */
export async function getHistorySummary() {
  "use cache: private";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });
  const { db } = await authed();
  const cats = await categories(db);
  const rows = await ledger(db, HISTORY.start, HISTORY.end, cats);
  const summary = summarize(rows);
  const recorded = new Set(rows.filter((r) => r.in_reports && r.category?.kind !== "adjustment").map((r) => r.reportOn.slice(0, 7))).size;
  return {
    summary,
    monthsRecorded: recorded,
    avgSpent: recorded ? Math.round(summary.spent / recorded) : 0,
    avgIncome: recorded ? Math.round(summary.income / recorded) : 0,
    adjustments: adjustmentRows(rows),
    transactions: byCategory(rows),
  };
}

/** Spent per month since FIRST_MONTH, for the month picker. */
export async function getMonthIndex() {
  "use cache: private";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const { db, today } = await authed();
  const cats = await categories(db);
  const current = monthKey(today);
  const rows = await ledger(db, `${FIRST_MONTH}-01`, monthRange(current).end, cats);
  const months: { month: MonthKey; spent: number }[] = [];
  for (let m = FIRST_MONTH; m <= current; m = monthKey(addMonths(`${m}-01`, 1))) {
    months.push({ month: m, spent: summarize(rows.filter((r) => r.reportOn.startsWith(m))).spent });
  }
  return { current, months };
}

export async function getBudgets(month?: MonthKey) {
  const { db, today } = await session();
  const m = month ?? monthKey(today);
  const cats = await categories(db);
  const [rows, lines, prof] = await Promise.all([monthLedger(db, m, cats), budgetLines(db, m), profile(db)]);
  const { end } = monthRange(m);
  return {
    month: m,
    total: prof.monthlyBudget,
    daysLeft: m === monthKey(today) ? Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000) + 1 : 0,
    status: budgetStatus(lines, spentByCategory(rows)),
    transactions: byCategory(rows),
    categoryNames: Object.fromEntries([...cats.values()].map((c) => [c.id, { name: c.name, icon: c.icon, color: c.color }])),
  };
}

export async function getDebts() {
  const { db, today } = await session();
  const [bal, meta] = await Promise.all([
    balances(db),
    db.from("accounts").select("id,institution,last4,credit_limit_cents,apr").then(ok),
  ]);
  const loan = await getLoanFor(db, today, bal);
  const info = new Map(meta.map((m) => [m.id, m]));
  const withInfo = (b: Balance) => {
    const m = info.get(b.account_id);
    return {
      ...b,
      owed: -b.balance_cents,
      institution: m?.institution ?? null,
      last4: m?.last4 ?? null,
      limit: m?.credit_limit_cents != null ? Number(m.credit_limit_cents) : null,
      apr: m?.apr != null ? Number(m.apr) : null,
    };
  };
  const cards = bal.filter((b) => b.account_group === "debt_card").map(withInfo);
  const plans = bal.filter((b) => b.account_group === "debt_loan" && b.key !== "student_loan").map(withInfo);
  return {
    cards,
    plans,
    total: [...cards, ...plans].reduce((s, d) => s + d.owed, 0),
    loanOwed: loan?.owed ?? null,
  };
}

export async function getStudentLoan() {
  const { db, today } = await session();
  return getLoanFor(db, today, await balances(db));
}

/**
 * Student loan state. Payments = spending in the "student_loan" category
 * (the EMI part of each Remitly transfer; the rest is money for home).
 */
async function getLoanFor(db: Db, today: ISODate, bal: Balance[]) {
  const acct = bal.find((b) => b.key === "student_loan");
  if (!acct) return null;
  const [meta, snap, cat] = await Promise.all([
    db.from("accounts").select("apr,monthly_payment_cents").eq("id", acct.account_id).single().then(ok),
    db.from("balance_snapshots").select("as_of,amount_cents,native_amount,fx_rate")
      .eq("account_id", acct.account_id).order("as_of", { ascending: false }).limit(1).single().then(ok),
    db.from("categories").select("id").eq("key", "student_loan").maybeSingle().then(okMaybe),
  ]);
  let payments: { date: ISODate; cents: number }[] = [];
  if (cat) {
    const [direct, splits] = await Promise.all([
      db.from("transactions").select("date,amount_cents").eq("category_id", cat.id).then(ok),
      db.from("transaction_splits").select("amount_cents,transaction:transactions(date)").eq("category_id", cat.id).then(ok),
    ]);
    payments = [
      ...direct.map((p) => ({ date: p.date as ISODate, cents: -Number(p.amount_cents) })),
      ...splits.filter((s) => s.transaction).map((s) => ({ date: s.transaction!.date as ISODate, cents: -Number(s.amount_cents) })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  const apr = Number(meta.apr ?? 0);
  const state = loanState({ anchorOwed: -Number(snap.amount_cents), anchorDate: snap.as_of, aprPct: apr, payments, today });
  const monthlyPayment = Number(meta.monthly_payment_cents ?? 0);
  return {
    name: acct.name,
    owed: state.owed,
    paid: payments.reduce((s, p) => s + p.cents, 0),
    payments: payments.slice().reverse(),
    apr,
    nextInterest: state.nextInterest,
    nextInterestDate: state.nextInterestDate,
    monthlyPayment,
    toPrincipal: monthlyPayment - state.nextInterest,
    payoff: payoffMonth(state.owed, apr, monthlyPayment, today),
    inr: snap.native_amount != null ? -Number(snap.native_amount) : null,
    fxRate: snap.fx_rate != null ? Number(snap.fx_rate) : null,
    anchorDate: snap.as_of as ISODate,
  };
}
