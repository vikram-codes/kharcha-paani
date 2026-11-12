import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { budgetBand, budgetStatus, type BudgetLineDef } from "./budget";
import { needsAdding, openOccurrence, OVERDUE_GRACE_DAYS, type LedgerHit } from "./bill-due";
import { addDays, addMonths, monthKey, monthRange, todayISO, type ISODate, type MonthKey } from "./dates";
import { loanState, payoffMonth } from "./loan";
import { allocateCents } from "./money";
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

/**
 * Requests that don't come from the browser (Claude over MCP) carry no cookies.
 * They run inside runAsUser(), with a Supabase client signed in as the owner,
 * so every function below works the same way and RLS still applies.
 */
const userContext = new AsyncLocalStorage<{ db: Db; today: ISODate }>();

export function runAsUser<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return userContext.run({ db, today: todayISO() }, fn);
}

/** For `"use cache: private"` scopes, where connection() isn't allowed. */
async function authed() {
  const ctx = userContext.getStore();
  if (ctx) return ctx;
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

import { FIRST_MONTH, HISTORY } from "./periods";
export { FIRST_MONTH, HISTORY };

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

/**
 * Categories rarely change but almost every screen needs them: load them once
 * per page render (React cache), not once per data function.
 */
const categoriesOnce = cache(async (): Promise<Map<string, CategoryInfo>> => categoriesFrom((await authed()).db));

async function categories(db: Db): Promise<Map<string, CategoryInfo>> {
  // Inside MCP requests (runAsUser) there is no React render to cache in.
  return userContext.getStore() ? categoriesFrom(db) : categoriesOnce();
}

async function categoriesFrom(db: Db): Promise<Map<string, CategoryInfo>> {
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
      .select("line_id,transaction_id,date,report_on,description,note,amount_cents,is_transfer,in_reports,category_id,account_id,is_split")
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
  // Money a friend owes you on a transaction isn't your spending (§6): take it off that line.
  const txIds = [...new Set(rows.filter((r) => Number(r.amount_cents) < 0).map((r) => r.transaction_id!))];
  const owedByTx = new Map<string, number>();
  for (let i = 0; i < txIds.length; i += 300) {
    const part = ok(await db.from("shared_debts").select("transaction_id,amount_cents").in("transaction_id", txIds.slice(i, i + 300)));
    for (const o of part) owedByTx.set(o.transaction_id!, (owedByTx.get(o.transaction_id!) ?? 0) + Number(o.amount_cents));
  }
  // On a split transaction, the friend's part comes off its spending lines in proportion.
  const owedByLine = new Map<string, number>();
  const splitTx = [...new Set(rows.filter((r) => r.is_split && owedByTx.has(r.transaction_id!)).map((r) => r.transaction_id!))];
  if (splitTx.length) {
    const lines = ok(await db.from("transaction_splits").select("id,transaction_id,amount_cents").in("transaction_id", splitTx).lt("amount_cents", 0));
    for (const t of splitTx) {
      const mine = lines.filter((l) => l.transaction_id === t).map((l) => ({ id: l.id, cents: -Number(l.amount_cents) }));
      if (mine.length) allocateCents(owedByTx.get(t)!, mine.map((m) => m.cents)).forEach((c, i) => owedByLine.set(mine[i].id, c));
    }
  }
  return rows.map((r) => ({
    id: r.line_id!,
    date: r.date as ISODate,
    reportOn: r.report_on as ISODate,
    description: r.is_split && r.note ? `${r.description} · ${r.note}` : (r.description ?? ""),
    account: accountName.get(r.account_id!) ?? "",
    split: Boolean(r.is_split),
    amount_cents: Number(r.amount_cents) + (r.is_split ? (owedByLine.get(r.line_id!) ?? 0) : Number(r.amount_cents) < 0 ? (owedByTx.get(r.line_id!) ?? 0) : 0),
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

export type Upcoming = {
  id: string;
  name: string;
  note: string | null;
  date: ISODate;
  amount_cents: number;
  icon: string | null;
  color: string | null;
  /** Due within a day (or overdue) and not added yet: show the "Add" badge. */
  addNow: boolean;
  /** What quick-add pre-fills from the badge. */
  categoryId: string | null;
  accountId: string | null;
  paysAccountId: string | null;
};

/**
 * Each active bill's next occurrence that hasn't been added yet, soonest first
 * (§6). Unadded bills stay up to 3 days past their date; once a matching entry
 * exists (quick-add, import or Claude), the bill moves to its next date.
 */
async function upcoming(db: Db, today: ISODate, cats: Map<string, CategoryInfo>): Promise<Upcoming[]> {
  const [rows, near] = await Promise.all([
    db.from("recurring_series").select("id,name,note,amount_cents,cadence,next_date,end_date,category_id,account_id,pays_account_id").eq("active", true).then(ok),
    db
      .from("transactions")
      .select("date,amount_cents,category_id,account_id,transaction_splits(category_id,amount_cents)")
      .gte("date", addDays(today, -OVERDUE_GRACE_DAYS - 5))
      .lte("date", addDays(today, 9))
      .then(ok),
  ]);
  // A split transaction counts by its parts.
  const hits: LedgerHit[] = near.flatMap((t) =>
    t.transaction_splits.length
      ? [
          ...t.transaction_splits.map((s) => ({ date: t.date as ISODate, cents: Number(s.amount_cents), categoryId: s.category_id, accountId: t.account_id })),
          // The whole payment too, for matching by account.
          { date: t.date as ISODate, cents: Number(t.amount_cents), categoryId: null, accountId: t.account_id },
        ]
      : [{ date: t.date as ISODate, cents: Number(t.amount_cents), categoryId: t.category_id, accountId: t.account_id }],
  );
  const out: Upcoming[] = [];
  for (const r of rows) {
    const d = openOccurrence({ ...r, amount_cents: Number(r.amount_cents) }, today, hits);
    if (!d) continue;
    const c = r.category_id ? cats.get(r.category_id) : undefined;
    out.push({
      id: r.id,
      name: r.name,
      note: r.note,
      date: d,
      amount_cents: Number(r.amount_cents),
      icon: c?.icon ?? null,
      color: c?.color ?? null,
      addNow: needsAdding(d, today),
      categoryId: r.category_id,
      accountId: r.account_id,
      paysAccountId: r.pays_account_id,
    });
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
  const [bal, rows, income, bills, lines, owed, prof, emergencyMeta] = await Promise.all([
    balances(db),
    monthLedger(db, month, cats),
    incomeSettings(db),
    upcoming(db, today, cats),
    budgetLines(db, month),
    db.from("shared_debts").select("amount_cents").is("settled_at", null).then(ok),
    profile(db),
    db.from("accounts").select("institution").eq("account_group", "cash_emergency").limit(1).maybeSingle().then(okMaybe),
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
    emergencyInstitution: emergencyMeta?.institution ?? null,
    // Cash breakdown. The emergency fund's amount is never sent here: it needs the PIN.
    cashAccounts: bal
      .filter((b) => b.account_group === "cash_bank" || b.account_group === "cash_emergency")
      .map((b) => {
        const emergency = b.account_group === "cash_emergency";
        return { id: b.account_id, name: b.name, cents: emergency || b.hidden ? null : b.balance_cents, emergency };
      }),
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
  return monthSummaryData(month);
}

/** Uncached month summary: used by the cached page read and by the in-page month switcher. */
export async function monthSummaryData(month: MonthKey) {
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
  return historySummaryData();
}

export async function historySummaryData() {
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

/** Spent per month since FIRST_MONTH, for the month picker (loaded when it opens). */
export async function getMonthIndex() {
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
    db.from("accounts").select("apr,monthly_payment_cents,borrowed_native,emi_native").eq("id", acct.account_id).single().then(ok),
    db.from("balance_snapshots").select("as_of,amount_cents,native_amount,fx_rate,created_at")
      .eq("account_id", acct.account_id).order("as_of", { ascending: false }).order("created_at", { ascending: false }).limit(1).single().then(ok),
    db.from("categories").select("id").eq("key", "student_loan").maybeSingle().then(okMaybe),
  ]);
  // A payment recorded after the balance was set on the same day still counts.
  let payments: { date: ISODate; cents: number; afterAnchor: boolean }[] = [];
  if (cat) {
    const [direct, splits] = await Promise.all([
      db.from("transactions").select("date,amount_cents,created_at").eq("category_id", cat.id).then(ok),
      db.from("transaction_splits").select("amount_cents,transaction:transactions(date,created_at)").eq("category_id", cat.id).then(ok),
    ]);
    const after = (createdAt: string) => createdAt > snap.created_at;
    payments = [
      ...direct.map((p) => ({ date: p.date as ISODate, cents: -Number(p.amount_cents), afterAnchor: after(p.created_at) })),
      ...splits
        .filter((s) => s.transaction)
        .map((s) => ({ date: s.transaction!.date as ISODate, cents: -Number(s.amount_cents), afterAnchor: after(s.transaction!.created_at) })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  const apr = Number(meta.apr ?? 0);
  const monthlyPayment = Number(meta.monthly_payment_cents ?? 0);
  const fx = snap.fx_rate != null ? Number(snap.fx_rate) : null;
  const emiInr = meta.emi_native != null ? Number(meta.emi_native) : null;
  const borrowedInr = meta.borrowed_native != null ? Number(meta.borrowed_native) : null;
  const anchorInr = snap.native_amount != null ? -Number(snap.native_amount) : null;
  // The loan lives in rupees: each EMI recorded takes one rupee EMI off the
  // moment it's entered (owner, Nov 10 2026), interest compounds in rupees,
  // and CAD is that balance at the snapshot's rate.
  const rupees = fx && emiInr && anchorInr != null;
  const state = rupees
    ? loanState({ anchorOwed: anchorInr * 100, anchorDate: snap.as_of, aprPct: apr, payments: payments.map((p) => ({ ...p, cents: emiInr * 100 })), today })
    : loanState({ anchorOwed: -Number(snap.amount_cents), anchorDate: snap.as_of, aprPct: apr, payments, today });
  const toCad = (paise: number) => (rupees ? Math.round(paise / fx) : paise);
  const owed = toCad(state.owed);
  const nextInterest = toCad(state.nextInterest);
  const owedInr = rupees ? Math.round(state.owed / 100) : null;
  // Interest charged to date, in rupees: owed now − borrowed + repaid (each EMI
  // recorded counts as one rupee EMI; the first EMI was Oct 2026).
  const interest =
    rupees && borrowedInr && owedInr != null
      ? {
          borrowedInr,
          repaidInr: payments.length * emiInr,
          owedInr,
          chargedInr: owedInr - borrowedInr + payments.length * emiInr,
          perMonthInr: Math.round(state.nextInterest / 100),
          fx,
        }
      : null;
  return {
    name: acct.name,
    owed,
    paid: payments.reduce((s, p) => s + p.cents, 0),
    payments: payments.slice().reverse(),
    apr,
    nextInterest,
    nextInterestDate: state.nextInterestDate,
    monthlyPayment,
    toPrincipal: monthlyPayment - nextInterest,
    payoff: payoffMonth(owed, apr, monthlyPayment, today),
    inr: owedInr ?? anchorInr,
    fxRate: snap.fx_rate != null ? Number(snap.fx_rate) : null,
    anchorDate: snap.as_of as ISODate,
    emiInr,
    interest,
  };
}

// ───────────────────────────── quick-add ─────────────────────────────

/** Accounts you can pay from in quick-add: chequing + the credit cards. */
const SPEND_GROUPS = ["cash_bank", "debt_card"];

export async function getQuickAddOptions() {
  const { db, today } = await authed();
  const since = addMonths(today, -3);
  const [accounts, cats, recent, prof] = await Promise.all([
    db.from("accounts").select("id,key,name,account_group,last4,sort_order").in("account_group", SPEND_GROUPS).eq("archived", false).order("sort_order").then(ok),
    categories(db),
    db.from("transactions").select("category_id").gte("date", since).not("category_id", "is", null).limit(1000).then(ok),
    db.from("profiles").select("last_account_id").maybeSingle().then(okMaybe),
  ]);
  // Savings accounts aren't where purchases come from.
  const payFrom = accounts.filter((a) => a.account_group === "debt_card" || a.key.includes("chequing"));
  const uses = new Map<string, number>();
  for (const r of recent) uses.set(r.category_id!, (uses.get(r.category_id!) ?? 0) + 1);
  const archived = new Set(ok(await db.from("categories").select("id").eq("archived", true)).map((c) => c.id));
  const pick = (kind: CategoryInfo["kind"]) =>
    [...cats.values()]
      .filter((c) => c.kind === kind && c.parentName && !archived.has(c.id)) // active subcategories only
      .map((c) => ({ id: c.id, name: c.name, parent: c.parentName, icon: c.icon, color: c.color, uses: uses.get(c.id) ?? 0 }))
      .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  const lastAccountId = prof?.last_account_id && payFrom.some((a) => a.id === prof.last_account_id) ? prof.last_account_id : null;
  return {
    today,
    accounts: payFrom.map((a) => ({ id: a.id, name: a.name, last4: a.last4 })),
    lastAccountId: lastAccountId ?? payFrom.find((a) => a.account_group === "debt_card")?.id ?? payFrom[0]?.id ?? null,
    expense: pick("expense"),
    income: pick("income"),
    // Transfers: money leaves a bank account, goes to a card (payment) or another bank account (e.g. savings).
    transferFrom: accounts.filter((a) => a.account_group === "cash_bank").map((a) => ({ id: a.id, name: a.name, last4: a.last4 })),
    transferTo: accounts.map((a) => ({ id: a.id, name: a.name, last4: a.last4, card: a.account_group === "debt_card" })),
  };
}

/**
 * Card payment or bank-to-bank move (§3.4): a linked pair, money out of `from`
 * and into `to`. Not spending, not income: chequing goes down, the card's debt
 * goes down (or savings goes up).
 */
export async function createTransfer(input: { fromId: string; toId: string; cents: number; date: ISODate; note?: string | null; clientId?: string | null }) {
  const { db, today } = await authed();
  const clientId = validClientId(input.clientId);
  if (!Number.isInteger(input.cents) || input.cents <= 0 || input.cents > 100_000_000) throw new Error("Enter an amount.");
  if (input.fromId === input.toId) throw new Error("Pick two different accounts.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today;
  const accts = ok(await db.from("accounts").select("id,name,account_group").in("id", [input.fromId, input.toId]));
  const from = accts.find((a) => a.id === input.fromId);
  const to = accts.find((a) => a.id === input.toId);
  if (!from || from.account_group !== "cash_bank") throw new Error("Transfers come from a bank account (chequing or savings).");
  if (!to || !["cash_bank", "debt_card"].includes(to.account_group)) throw new Error("Send it to a card or a bank account.");
  const key = to.account_group === "debt_card" ? "cc_payment" : "savings_xfer";
  const cat = okMaybe(await db.from("categories").select("id").eq("key", key).maybeSingle());
  const note = input.note?.trim().slice(0, 200) || null;
  const label = to.account_group === "debt_card" ? `Payment to ${to.name}` : `To ${to.name}`;
  const first = await db
    .from("transactions")
    .insert({ account_id: from.id, date, amount_cents: -input.cents, description: label, note, category_id: cat?.id ?? null, is_transfer: true, source: "manual", client_id: clientId })
    .select("id");
  // Already saved by an earlier attempt of this offline entry: nothing more to do.
  if (isDuplicateClientId(first.error, clientId)) return { from: from.name, to: to.name };
  const [out] = ok(first);
  const [inn] = ok(
    await db
      .from("transactions")
      .insert({
        account_id: to.id,
        date,
        amount_cents: input.cents,
        description: to.account_group === "debt_card" ? `Payment from ${from.name}` : `From ${from.name}`,
        note,
        category_id: cat?.id ?? null,
        is_transfer: true,
        source: "manual",
        transfer_pair_id: out.id,
      })
      .select("id"),
  );
  ok(await db.from("transactions").update({ transfer_pair_id: inn.id }).eq("id", out.id).select("id"));
  return { from: from.name, to: to.name };
}

export type NewTransaction = {
  kind: "expense" | "income";
  amountCents: number;
  accountId: string;
  categoryId: string;
  date: ISODate;
  note?: string;
  /** Debt this payment lowers (an Affirm plan, from a bill's "pays"). */
  paysAccountId?: string | null;
  /** Made on the phone for offline entries, so a retried sync can't save twice. */
  clientId?: string | null;
};

const validClientId = (id: string | null | undefined) =>
  id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;

/** The insert hit the (user, client_id) unique index: this entry is already saved. */
const isDuplicateClientId = (error: { code?: string } | null, clientId: string | null) => !!clientId && error?.code === "23505";

/** Saves a manual entry. Expenses are negative (card purchase → debt up; chequing → cash down). */
export async function createManualTransaction(input: NewTransaction) {
  const { db } = await authed();
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 100_000_000) {
    throw new Error("Enter an amount above $0.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick a valid date.");
  const note = input.note?.trim().slice(0, 200) || null;
  // RLS limits both lookups to the owner's rows, so foreign ids simply aren't found.
  const [account, category, pays] = await Promise.all([
    db.from("accounts").select("id,name,account_group").eq("id", input.accountId).in("account_group", SPEND_GROUPS).maybeSingle().then(okMaybe),
    db.from("categories").select("id,name,kind").eq("id", input.categoryId).maybeSingle().then(okMaybe),
    input.paysAccountId && input.kind === "expense"
      ? db.from("accounts").select("id").eq("id", input.paysAccountId).in("account_group", ["debt_loan", "debt_card"]).maybeSingle().then(okMaybe)
      : Promise.resolve(null),
  ]);
  if (!account) throw new Error("Choose where it was paid from.");
  if (!category || category.kind !== input.kind) throw new Error("Choose a category.");
  const amount = input.kind === "expense" ? -input.amountCents : input.amountCents;
  const clientId = validClientId(input.clientId);
  const saved = await db
    .from("transactions")
    .insert({
      account_id: account.id,
      category_id: category.id,
      date: input.date,
      amount_cents: amount,
      description: note ?? category.name,
      note,
      source: "manual",
      pays_account_id: pays?.id ?? null,
      client_id: clientId,
    })
    .select("id")
    .single();
  if (!isDuplicateClientId(saved.error, clientId)) ok(saved);
  ok(await db.from("profiles").update({ last_account_id: account.id }).not("user_id", "is", null).select("user_id"));
  return { account: account.name, category: category.name, amountCents: amount };
}

// ───────────────────────────── cash + emergency fund ─────────────────────────────

export async function getCash() {
  const { db } = await session();
  const [bal, meta, owed] = await Promise.all([
    balances(db),
    db.from("accounts").select("id,institution,last4").in("account_group", ["cash_bank", "cash_emergency"]).then(ok),
    db.from("shared_debts").select("amount_cents").is("settled_at", null).then(ok),
  ]);
  const info = new Map(meta.map((m) => [m.id, m]));
  const bank = bal
    .filter((b) => b.account_group === "cash_bank")
    .map((b) => ({ id: b.account_id, name: b.name, cents: b.balance_cents, institution: info.get(b.account_id)?.institution ?? null, last4: info.get(b.account_id)?.last4 ?? null }));
  const emergency = bal.find((b) => b.account_group === "cash_emergency");
  return {
    bank,
    bankTotal: bank.reduce((t, b) => t + b.cents, 0),
    // Never the amount: that needs the PIN.
    emergency: emergency ? { id: emergency.account_id, name: emergency.name, institution: info.get(emergency.account_id)?.institution ?? null } : null,
    owedToMe: owed.reduce((t, o) => t + Number(o.amount_cents), 0),
  };
}

const PIN_MAX_TRIES = 5;
const PIN_LOCK_MINUTES = 5;

export type UnlockResult = { ok: true; cents: number } | { ok: false; error: string };

/** Checks the emergency PIN; on success returns the emergency fund balance. */
/**
 * Checks the owner's PIN (one PIN: app lock + emergency fund). 5 wrong tries in
 * a row lock it for 5 minutes. Server-side, so the lockout can't be skipped.
 */
export async function verifyOwnerPin(pin: string): Promise<{ ok: true } | { ok: false; error: string; noPin?: boolean }> {
  const { db } = await authed();
  const { isValidPin, verifyPin } = await import("./pin");
  const p = okMaybe(await db.from("profiles").select("user_id,emergency_pin_hash,pin_failed_count,pin_locked_until").maybeSingle());
  if (!p?.emergency_pin_hash) return { ok: false, error: "Set a PIN in Settings first.", noPin: true };
  if (p.pin_locked_until && Date.parse(p.pin_locked_until) > Date.now()) {
    const mins = Math.ceil((Date.parse(p.pin_locked_until) - Date.now()) / 60_000);
    return { ok: false, error: `Too many tries. Try again in ${mins} min.` };
  }
  if (!isValidPin(pin) || !verifyPin(pin, p.emergency_pin_hash)) {
    const fails = p.pin_failed_count + 1;
    const lock = fails >= PIN_MAX_TRIES;
    ok(
      await db
        .from("profiles")
        .update({ pin_failed_count: lock ? 0 : fails, pin_locked_until: lock ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString() : null })
        .eq("user_id", p.user_id)
        .select("user_id"),
    );
    return { ok: false, error: lock ? `Too many tries. Locked for ${PIN_LOCK_MINUTES} min.` : "Wrong PIN." };
  }
  if (p.pin_failed_count || p.pin_locked_until) {
    ok(await db.from("profiles").update({ pin_failed_count: 0, pin_locked_until: null }).eq("user_id", p.user_id).select("user_id"));
  }
  return { ok: true };
}

/** Whether the owner has a PIN set (the app lock only applies then). */
export async function hasOwnerPin() {
  const { db } = await authed();
  const p = okMaybe(await db.from("profiles").select("emergency_pin_hash").maybeSingle());
  return Boolean(p?.emergency_pin_hash);
}

/** Checks the PIN; on success returns the emergency fund balance. */
export async function unlockEmergencyFund(pin: string): Promise<UnlockResult> {
  const v = await verifyOwnerPin(pin);
  if (!v.ok) return { ok: false, error: v.error };
  const { db } = await authed();
  const em = ok(await db.from("account_balances").select("balance_cents").eq("account_group", "cash_emergency"));
  return { ok: true, cents: em.reduce((t, r) => t + Number(r.balance_cents), 0) };
}

export async function changeEmergencyPin(current: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { db } = await authed();
  const { hashPin, isValidPin, verifyPin } = await import("./pin");
  if (!isValidPin(next)) return { ok: false, error: "The new PIN must be 4–6 digits." };
  const p = okMaybe(await db.from("profiles").select("user_id,emergency_pin_hash,pin_locked_until").maybeSingle());
  if (!p) return { ok: false, error: "Profile not found." };
  if (p.pin_locked_until && Date.parse(p.pin_locked_until) > Date.now()) return { ok: false, error: "PIN is locked for a few minutes. Try again soon." };
  if (p.emergency_pin_hash && !verifyPin(current, p.emergency_pin_hash)) return { ok: false, error: "Current PIN is wrong." };
  ok(
    await db
      .from("profiles")
      .update({ emergency_pin_hash: hashPin(next), pin_failed_count: 0, pin_locked_until: null })
      .eq("user_id", p.user_id)
      .select("user_id"),
  );
  return { ok: true };
}

// ───────────────────────────── activity (transactions list) ─────────────────────────────

export type ActivityRow = {
  id: string;
  date: ISODate;
  amount_cents: number;
  description: string;
  note: string | null;
  account: string;
  accountGroup: string;
  source: string;
  isTransfer: boolean;
  category: Pick<CategoryInfo, "id" | "name" | "parentName" | "icon" | "color" | "kind"> | null;
  /** Category names when the transaction is split. */
  splits: { name: string; amount_cents: number; categoryId: string | null }[];
  accountId: string;
  /** Part of this transaction friends owe you. */
  owed: { id: string; person: string; amount_cents: number; settled: boolean }[];
};

/** Transactions paid in a month (by payment date), newest first, plus upcoming bills. */
export async function getActivity(month?: MonthKey) {
  await connection();
  return activityData(month);
}

/** Same, without connection() so a Server Action can call it (month switching). */
const ACTIVITY_SELECT =
  "id,date,description,note,amount_cents,is_transfer,in_reports,source,category_id,account_id,account:accounts!transactions_account_id_fkey(name,account_group),transaction_splits(category_id,amount_cents),shared_debts!shared_debts_transaction_id_fkey(id,person,amount_cents,settled_at)";

function activityQuery(db: Db) {
  return db.from("transactions").select(ACTIVITY_SELECT).eq("in_reports", true).order("date", { ascending: false }).order("created_at", { ascending: false });
}

type ActivityDbRow = Awaited<ReturnType<typeof activityQuery>>["data"] extends (infer R)[] | null ? R : never;

function toActivityRows(rows: ActivityDbRow[], cats: Map<string, CategoryInfo>): ActivityRow[] {
  return rows.map((r) => {
    const c = r.category_id ? cats.get(r.category_id) : undefined;
    return {
      id: r.id,
      date: r.date as ISODate,
      amount_cents: Number(r.amount_cents),
      description: r.description,
      note: r.note,
      account: r.account?.name ?? "",
      accountGroup: r.account?.account_group ?? "",
      source: r.source,
      isTransfer: r.is_transfer || c?.kind === "transfer",
      category: c ? { id: c.id, name: c.name, parentName: c.parentName, icon: c.icon, color: c.color, kind: c.kind } : null,
      splits: r.transaction_splits.map((s) => ({
        name: (s.category_id && cats.get(s.category_id)?.name) || "Uncategorized",
        amount_cents: Number(s.amount_cents),
        categoryId: s.category_id,
      })),
      accountId: r.account_id,
      owed: r.shared_debts.map((o) => ({ id: o.id, person: o.person, amount_cents: Number(o.amount_cents), settled: !!o.settled_at })),
    };
  });
}

export async function activityData(month?: MonthKey) {
  const { db, today } = await authed();
  const m = month ?? monthKey(today);
  const { start, end } = monthRange(m);
  const cats = await categories(db);
  const [rows, bills] = await Promise.all([
    activityQuery(db).gte("date", start).lte("date", end).limit(1000).then(ok),
    m === monthKey(today) ? upcoming(db, today, cats) : Promise.resolve([]),
  ]);
  return { month: m, today, current: monthKey(today), rows: toActivityRows(rows, cats), upcoming: bills };
}

/**
 * Search across every month: merchant/description, note, category (including
 * split lines) or account name. Newest first, up to 200 transactions.
 */
export async function searchActivity(query: string) {
  const { db, today } = await authed();
  // Characters that would break PostgREST's filter syntax are dropped.
  const q = query.replace(/[%_,()*\\"'.:]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return { today, rows: [] as ActivityRow[], more: false };
  const like = `%${q}%`;
  const cats = await categories(db);
  const [catHits, acctHits] = await Promise.all([
    db.from("categories").select("id").ilike("name", like).then(ok),
    db.from("accounts").select("id").ilike("name", like).then(ok),
  ]);
  const catIds = catHits.map((c) => c.id);
  const LIMIT = 200;
  const splitTx = catIds.length
    ? ok(await db.from("transaction_splits").select("transaction_id").in("category_id", catIds).limit(LIMIT)).map((s) => s.transaction_id)
    : [];
  const queries = [
    activityQuery(db).or(`description.ilike."*${q}*",note.ilike."*${q}*"`).limit(LIMIT),
    catIds.length ? activityQuery(db).in("category_id", catIds).limit(LIMIT) : null,
    acctHits.length ? activityQuery(db).in("account_id", acctHits.map((a) => a.id)).limit(LIMIT) : null,
    splitTx.length ? activityQuery(db).in("id", [...new Set(splitTx)]).limit(LIMIT) : null,
  ].filter((x) => x !== null);
  const seen = new Map<string, ActivityDbRow>();
  for (const rows of await Promise.all(queries.map((x) => x.then(ok)))) for (const r of rows) seen.set(r.id, r);
  const rows = [...seen.values()].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  return { today, rows: toActivityRows(rows.slice(0, LIMIT), cats), more: rows.length > LIMIT };
}

/** One account's page: balance, card details and its recent entries (newest first). */
export async function getAccountDetail(id: string, limit = 80) {
  const { db, today } = await authed();
  const acct = okMaybe(
    await db.from("accounts").select("id,key,name,institution,last4,account_group,credit_limit_cents,apr,archived").eq("id", id).maybeSingle(),
  );
  // The emergency fund stays behind its PIN; legacy history accounts have no balance.
  if (!acct || acct.account_group === "cash_emergency" || acct.account_group === "legacy") return null;
  const cats = await categories(db);
  const [bal, rows] = await Promise.all([
    db.from("account_balances").select("balance_cents,anchor_date").eq("account_id", id).maybeSingle().then(okMaybe),
    activityQuery(db).eq("account_id", id).limit(limit).then(ok),
  ]);
  const debt = acct.account_group.startsWith("debt_");
  const balance = Number(bal?.balance_cents ?? 0);
  const owed = debt ? -balance : null;
  return {
    today,
    id: acct.id,
    name: acct.name,
    institution: acct.institution,
    last4: acct.last4,
    group: acct.account_group,
    debt,
    balance,
    owed,
    limit: acct.credit_limit_cents != null ? Number(acct.credit_limit_cents) : null,
    apr: acct.apr != null ? Number(acct.apr) : null,
    since: (bal?.anchor_date as ISODate | null) ?? null,
    rows: toActivityRows(rows, cats),
  };
}

/** First month the transaction list goes back to (Money Pro history starts here). */
export const FIRST_ACTIVITY_MONTH: MonthKey = "2024-12";

/** Options for the edit sheet: accounts you can pay from + every subcategory, grouped. */
export async function getEditOptions() {
  const { db } = await authed();
  const [accounts, cats] = await Promise.all([
    db.from("accounts").select("id,key,name,account_group,last4,sort_order").in("account_group", SPEND_GROUPS).eq("archived", false).order("sort_order").then(ok),
    categories(db),
  ]);
  const archived = new Set(ok(await db.from("categories").select("id").eq("archived", true)).map((c) => c.id));
  const subs = [...cats.values()].filter((c) => c.parentName && !archived.has(c.id));
  const order: CategoryInfo["kind"][] = ["expense", "income", "transfer", "reimbursement", "adjustment"];
  return {
    accounts: accounts.filter((a) => a.account_group === "debt_card" || a.key.includes("chequing")).map((a) => ({ id: a.id, name: a.name, last4: a.last4 })),
    categories: subs
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.parentName ?? "").localeCompare(b.parentName ?? "") || a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, parent: c.parentName, kind: c.kind, icon: c.icon, color: c.color })),
  };
}

export type TransactionPatch = { amountCents: number; categoryId: string | null; accountId: string; date: ISODate; note: string | null };

/** Thrown when a split transaction's amount changes without new split lines. */
export const SPLIT_NEEDS_UPDATE = "This transaction is split. Update the split to match the new amount.";

export type SplitLine = { categoryId: string; cents: number };

/**
 * Edits a transaction. The sign of amountCents is the direction (negative = money out / card purchase).
 * A split transaction whose amount changes needs `splits` (positive, adding up to the new amount).
 * The other leg of a transfer follows: same date and note, opposite amount.
 */
export async function updateTransaction(id: string, patch: TransactionPatch, splits?: SplitLine[]) {
  const { db } = await authed();
  if (!Number.isInteger(patch.amountCents) || patch.amountCents === 0 || Math.abs(patch.amountCents) > 100_000_000) throw new Error("Enter an amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) throw new Error("Pick a valid date.");
  const [tx, category, account] = await Promise.all([
    db.from("transactions").select("id,account_id,amount_cents,is_transfer,transfer_pair_id,transaction_splits(id)").eq("id", id).maybeSingle().then(okMaybe),
    patch.categoryId ? db.from("categories").select("id,kind").eq("id", patch.categoryId).maybeSingle().then(okMaybe) : Promise.resolve(null),
    db.from("accounts").select("id").eq("id", patch.accountId).maybeSingle().then(okMaybe),
  ]);
  if (!tx) throw new Error("Transaction not found.");
  if (patch.categoryId && !category) throw new Error("Choose a category.");
  if (!account) throw new Error("Choose an account.");
  const split = tx.transaction_splits.length > 0;
  const amountChanged = Number(tx.amount_cents) !== patch.amountCents;
  // Check the new split lines before writing anything.
  const lines = split && amountChanged ? checkSplitLines(splits, Math.abs(patch.amountCents)) : null;
  const note = patch.note?.trim().slice(0, 200) || null;
  ok(
    await db
      .from("transactions")
      .update({
        amount_cents: patch.amountCents,
        account_id: account.id,
        date: patch.date,
        note,
        // A split transaction's categories live on its split lines.
        // A linked transfer leg stays a transfer; uncategorized keeps what it was.
        ...(split
          ? {}
          : { category_id: category?.id ?? null, is_transfer: tx.transfer_pair_id ? true : category ? category.kind === "transfer" : tx.is_transfer }),
      })
      .eq("id", id)
      .select("id"),
  );
  if (lines) await replaceSplits(db, id, Math.sign(patch.amountCents), lines);
  // The other leg of a transfer moves with it, so both accounts stay in step.
  if (tx.transfer_pair_id) {
    ok(await db.from("transactions").update({ amount_cents: -patch.amountCents, date: patch.date, note }).eq("id", tx.transfer_pair_id).select("id"));
  }
}

/** Split lines must be 2+, each with a category and a positive amount, adding up to `total`. */
function checkSplitLines(lines: SplitLine[] | undefined, total: number): SplitLine[] {
  if (!lines) throw new Error(SPLIT_NEEDS_UPDATE);
  const clean = lines.filter((l) => l.cents > 0);
  if (clean.length < 2) throw new Error("A split needs at least two lines.");
  if (clean.some((l) => !Number.isInteger(l.cents) || !l.categoryId)) throw new Error("Each line needs a category and an amount.");
  const sum = clean.reduce((t, l) => t + l.cents, 0);
  if (sum !== total) throw new Error(`Lines add up to ${(sum / 100).toFixed(2)}, not ${(total / 100).toFixed(2)}.`);
  return clean;
}

async function replaceSplits(db: Db, transactionId: string, sign: number, lines: SplitLine[]) {
  ok(await db.from("transaction_splits").delete().eq("transaction_id", transactionId).select("id"));
  ok(await db.from("transaction_splits").insert(lines.map((l) => ({ transaction_id: transactionId, category_id: l.categoryId, amount_cents: sign * l.cents }))).select("id"));
}

/** Deletes a transaction, and the other leg too when it's a transfer. */
export async function deleteTransaction(id: string) {
  const { db } = await authed();
  const tx = okMaybe(await db.from("transactions").select("id,transfer_pair_id").eq("id", id).maybeSingle());
  if (!tx) throw new Error("Transaction not found.");
  // Either leg may point at the other (older pairs only link one way).
  const legs = ok(await db.from("transactions").select("id").or(`id.eq.${id},transfer_pair_id.eq.${id}${tx.transfer_pair_id ? `,id.eq.${tx.transfer_pair_id}` : ""}`));
  const ids = legs.map((l) => l.id);
  ok(await db.from("transactions").delete().in("id", ids).select("id"));
  return ids;
}

// ───────────────────────────── statement import (§4.3) ─────────────────────────────

export type ImportPreviewRow = {
  date: ISODate;
  posted: ISODate | null;
  amount_cents: number;
  description: string;
  merchant: string;
  fingerprint: string;
  status: "new" | "duplicate" | "possible" | "imported";
  /** What it matched (for duplicate / possible). */
  match: { date: ISODate; amount_cents: number; description: string; note: string | null } | null;
  categoryId: string | null;
};

/** Reads a statement PDF and returns what would be imported. Saves nothing. */
export async function previewStatement(bytes: Uint8Array, fileName: string) {
  const { db } = await authed();
  const [{ pdfToLayoutText }, { parseStatement }, { matchDuplicates, fingerprints }, { suggestCategory }, { cleanMerchant }] = await Promise.all([
    import("./import/pdf-text"),
    import("./import/statements"),
    import("./import/dedupe"),
    import("./import/categorize"),
    import("./merchant"),
  ]);
  const text = await pdfToLayoutText(bytes);
  const parsed = parseStatement(text);
  const account = okMaybe(await db.from("accounts").select("id,name").eq("key", parsed.source).maybeSingle());
  if (!account) throw new Error(`No account set up for ${parsed.source}.`);
  if (!parsed.rows.length) throw new Error("No transactions found in this statement.");

  const dates = parsed.rows.map((r) => r.date).sort();
  const from = addDays(dates[0], -3);
  const to = addDays(dates[dates.length - 1], 3);
  const [existing, cats] = await Promise.all([
    db.from("transactions").select("id,date,amount_cents,description,note,fingerprint").eq("account_id", account.id).gte("date", from).lte("date", to).limit(2000).then(ok),
    categories(db),
  ]);
  const prints = fingerprints(parsed.rows);
  const taken = new Set(existing.map((e) => e.fingerprint).filter(Boolean));
  const matches = matchDuplicates(
    parsed.rows,
    existing.map((e) => ({ id: e.id, date: e.date, amount_cents: Number(e.amount_cents), description: e.description })),
  );
  const byKey = new Map([...cats.values()].map((c) => [c.key, c.id]));
  const byId = new Map(existing.map((e) => [e.id, e]));
  // Owner rules ("always put X in Y") win over the built-in suggestions.
  const { merchantKey } = await import("./recurring");
  const rules = await userRules(db);
  const ruleFor = (desc: string) => {
    const k = merchantKey(desc);
    for (const r of rules) {
      if (r.match_field === "merchant" && r.pattern === k) return r.category_id;
      if (r.match_field === "description" && desc.toLowerCase().includes(r.pattern.toLowerCase())) return r.category_id;
    }
    return null;
  };

  const rows: ImportPreviewRow[] = parsed.rows.map((r, i) => {
    const m = matches[i];
    const hit = m.existingId ? byId.get(m.existingId) : undefined;
    const ruled = ruleFor(r.description);
    const key = ruled ? null : suggestCategory(r.description, r.amount_cents);
    return {
      ...r,
      merchant: cleanMerchant(r.description),
      fingerprint: prints[i],
      status: taken.has(prints[i]) ? "imported" : m.status,
      match: hit ? { date: hit.date as ISODate, amount_cents: Number(hit.amount_cents), description: hit.description, note: hit.note } : null,
      categoryId: ruled ?? (key ? (byKey.get(key) ?? null) : null),
    };
  });

  return {
    fileName,
    source: parsed.source,
    account: { id: account.id, name: account.name },
    periodEnd: parsed.periodEnd,
    checks: parsed.checks,
    rows,
  };
}

export type ImportCommit = {
  fileName: string;
  source: string;
  accountId: string;
  rows: { date: ISODate; posted: ISODate | null; amount_cents: number; description: string; fingerprint: string; categoryId: string | null }[];
  skipped: number;
};

/** Saves the confirmed rows as one import (undoable). Re-checks fingerprints so nothing is saved twice. */
export async function commitStatementImport(input: ImportCommit) {
  const { db } = await authed();
  const account = okMaybe(await db.from("accounts").select("id").eq("id", input.accountId).maybeSingle());
  if (!account) throw new Error("Account not found.");
  const rows = input.rows.filter(
    (r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isInteger(r.amount_cents) && r.amount_cents !== 0 && typeof r.fingerprint === "string",
  );
  const already = new Set(
    ok(await db.from("transactions").select("fingerprint").eq("account_id", account.id).in("fingerprint", rows.map((r) => r.fingerprint).slice(0, 1000))).map(
      (r) => r.fingerprint,
    ),
  );
  const fresh = rows.filter((r) => !already.has(r.fingerprint));
  const catIds = [...new Set(fresh.map((r) => r.categoryId).filter((x): x is string => !!x))];
  const kinds = new Map(
    catIds.length ? ok(await db.from("categories").select("id,kind").in("id", catIds)).map((c) => [c.id, c.kind]) : [],
  );

  const [imp] = ok(
    await db
      .from("imports")
      .insert({
        file_name: input.fileName.slice(0, 200),
        source: input.source,
        row_count: input.rows.length + input.skipped,
        imported_count: fresh.length,
        skipped_count: input.skipped + (rows.length - fresh.length),
        status: "committed",
      })
      .select("id"),
  );
  if (fresh.length) {
    ok(
      await db
        .from("transactions")
        .insert(
          fresh.map((r) => ({
            account_id: account.id,
            date: r.date,
            posted_date: r.posted,
            amount_cents: r.amount_cents,
            description: r.description.slice(0, 300),
            category_id: r.categoryId && kinds.has(r.categoryId) ? r.categoryId : null,
            is_transfer: r.categoryId ? kinds.get(r.categoryId) === "transfer" : false,
            source: "import",
            import_id: imp.id,
            fingerprint: r.fingerprint,
            needs_review: !r.categoryId,
          })),
        )
        .select("id"),
    );
  }
  return { imported: fresh.length, importId: imp.id };
}

export async function listImports() {
  const { db } = await session();
  return ok(
    await db.from("imports").select("id,file_name,source,imported_count,skipped_count,status,created_at").neq("source", "seed").order("created_at", { ascending: false }).limit(20),
  );
}

/** Removes every transaction an import added. */
export async function undoImport(id: string) {
  const { db } = await authed();
  const imp = okMaybe(await db.from("imports").select("id,status").eq("id", id).maybeSingle());
  if (!imp || imp.status !== "committed") throw new Error("Nothing to undo.");
  ok(await db.from("transactions").delete().eq("import_id", id).select("id"));
  ok(await db.from("imports").update({ status: "undone" }).eq("id", id).select("id"));
}

// ───────────────────────────── editing: budgets, balances, money owed to you ─────────────────────────────

/** Change the headline monthly budget (the round number, e.g. $3,000). */
export async function setMonthlyBudget(cents: number) {
  const { db } = await authed();
  if (!Number.isInteger(cents) || cents < 0 || cents > 10_000_000) throw new Error("Enter a valid amount.");
  const p = okMaybe(await db.from("profiles").select("user_id").maybeSingle());
  if (!p) throw new Error("Profile not found.");
  ok(await db.from("profiles").update({ monthly_budget_cents: cents }).eq("user_id", p.user_id).select("user_id"));
}

/**
 * Set budget line amounts. scope "month" = override for that month only;
 * "default" = from now on (also clears that month's override so it takes effect).
 */
export async function setBudgetLines(month: MonthKey, scope: "month" | "default", lines: { id: string; cents: number }[]) {
  const { db } = await authed();
  for (const l of lines) if (!Number.isInteger(l.cents) || l.cents < 0 || l.cents > 10_000_000) throw new Error("Enter valid amounts.");
  const owned = new Set(ok(await db.from("budget_lines").select("id").in("id", lines.map((l) => l.id))).map((r) => r.id));
  const valid = lines.filter((l) => owned.has(l.id));
  const monthDate = `${month}-01`;
  if (scope === "month") {
    if (valid.length)
      ok(await db.from("budgets").upsert(valid.map((l) => ({ line_id: l.id, month: monthDate, amount_cents: l.cents })), { onConflict: "user_id,line_id,month" }).select("id"));
  } else {
    for (const l of valid) ok(await db.from("budget_lines").update({ default_cents: l.cents }).eq("id", l.id).select("id"));
    if (valid.length) ok(await db.from("budgets").delete().eq("month", monthDate).in("line_id", valid.map((l) => l.id)).select("id"));
  }
}

/**
 * "This account is actually $X today": records a reconcile snapshot. Later
 * transactions add on; anything dated today or earlier is treated as included.
 * For debts pass what you owe as a positive number.
 */
export async function reconcileAccount(accountId: string, cents: number) {
  const { db, today } = await authed();
  if (!Number.isInteger(cents) || Math.abs(cents) > 1_000_000_000) throw new Error("Enter a valid amount.");
  const acct = okMaybe(await db.from("accounts").select("id,account_group").eq("id", accountId).maybeSingle());
  if (!acct) throw new Error("Account not found.");
  if (acct.account_group === "cash_emergency") throw new Error("Unlock the emergency fund to change it.");
  const signed = acct.account_group.startsWith("debt_") ? -Math.abs(cents) : cents;
  ok(await db.from("balance_snapshots").insert({ account_id: acct.id, as_of: today, amount_cents: signed, kind: "reconcile", note: "Updated by owner" }).select("id"));
}

export type OwedItem = { id: string; person: string; amount_cents: number; note: string | null; created_at: string; transaction: { date: string; description: string } | null };

export async function listOwed(): Promise<{ open: OwedItem[]; settled: (OwedItem & { settled_at: string })[] }> {
  const { db } = await authed();
  const rows = ok(
    await db
      .from("shared_debts")
      .select("id,person,amount_cents,note,created_at,settled_at,transaction:transactions!shared_debts_transaction_id_fkey(date,description)")
      .order("created_at", { ascending: false })
      .limit(100),
  );
  const map = (r: (typeof rows)[number]): OwedItem => ({
    id: r.id,
    person: r.person,
    amount_cents: Number(r.amount_cents),
    note: r.note,
    created_at: r.created_at,
    transaction: r.transaction ? { date: r.transaction.date, description: r.transaction.description } : null,
  });
  return {
    open: rows.filter((r) => !r.settled_at).map(map),
    settled: rows.filter((r) => r.settled_at).slice(0, 10).map((r) => ({ ...map(r), settled_at: r.settled_at! })),
  };
}

/** Someone owes you: on its own, or part of a transaction (that part leaves your spending). */
export async function addOwed(input: { person: string; amountCents: number; note?: string; transactionId?: string }) {
  const { db } = await authed();
  const person = input.person.trim().slice(0, 60);
  if (!person) throw new Error("Who owes you?");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Enter an amount.");
  if (input.transactionId) {
    const tx = okMaybe(await db.from("transactions").select("id,amount_cents").eq("id", input.transactionId).maybeSingle());
    if (!tx) throw new Error("Transaction not found.");
    const already = ok(await db.from("shared_debts").select("amount_cents").eq("transaction_id", tx.id)).reduce((t, r) => t + Number(r.amount_cents), 0);
    if (already + input.amountCents > Math.abs(Number(tx.amount_cents))) throw new Error("That's more than the transaction.");
  }
  ok(
    await db
      .from("shared_debts")
      .insert({ person, amount_cents: input.amountCents, note: input.note?.trim().slice(0, 200) || null, transaction_id: input.transactionId ?? null })
      .select("id"),
  );
}

export async function settleOwed(id: string) {
  const { db, today } = await authed();
  const rows = ok(await db.from("shared_debts").update({ settled_at: today }).eq("id", id).is("settled_at", null).select("id"));
  if (!rows.length) throw new Error("Already settled.");
}

export async function deleteOwed(id: string) {
  const { db } = await authed();
  ok(await db.from("shared_debts").delete().eq("id", id).select("id"));
}

// ───────────────────────────── bills (§7.7) ─────────────────────────────

/** Next date ≥ today for a series, or null if it has ended. */
function nextOccurrence(r: { cadence: string; next_date: string; end_date: string | null }, today: ISODate): ISODate | null {
  let d = r.next_date as ISODate;
  if (r.cadence === "monthly") for (let i = 1; d < today; i++) d = addMonths(r.next_date, i);
  if (d < today || (r.end_date && d > r.end_date)) return null;
  return d;
}

async function dismissedKeys(db: Db) {
  return new Set(ok(await db.from("dismissals").select("key")).map((d) => d.key));
}

export async function getBills() {
  const { db, today } = await authed();
  const { detectRecurring, merchantKey } = await import("./recurring");
  const [series, cats, accounts, recent, dismissed] = await Promise.all([
    db.from("recurring_series").select("id,name,note,amount_cents,cadence,next_date,end_date,active,account_id,category_id,merchant_key").order("next_date").then(ok),
    categories(db),
    db.from("accounts").select("id,key,name,account_group,last4").then(ok),
    db
      .from("transactions")
      .select("date,amount_cents,description,account_id,category_id,is_transfer")
      .gte("date", addDays(today, -125))
      .eq("in_reports", true)
      .eq("is_transfer", false)
      .lt("amount_cents", 0)
      .limit(2000)
      .then(ok),
    dismissedKeys(db),
  ]);
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const bills = series.map((s) => {
    const c = s.category_id ? cats.get(s.category_id) : undefined;
    return {
      id: s.id,
      name: s.name,
      note: s.note,
      amount_cents: Number(s.amount_cents),
      cadence: s.cadence as "once" | "monthly",
      startDate: s.next_date as ISODate,
      endDate: s.end_date as ISODate | null,
      next: s.active ? nextOccurrence(s, today) : null,
      active: s.active,
      accountId: s.account_id,
      account: s.account_id ? (acct.get(s.account_id)?.name ?? null) : null,
      categoryId: s.category_id,
      category: c ? { name: c.name, icon: c.icon, color: c.color } : null,
      merchantKey: s.merchant_key,
    };
  });
  const known = new Set(bills.flatMap((b) => [b.merchantKey, merchantKey(b.name)].filter(Boolean) as string[]));
  const suggestions = detectRecurring(recent.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) })))
    .filter((s) => !known.has(s.key) && !dismissed.has(`bill:${s.key}`))
    // Already covered by a bill in the same category at about the same amount (e.g. rent paid by e-Transfer).
    .filter(
      (s) =>
        !bills.some(
          (b) => b.active && b.categoryId && b.categoryId === s.category_id && Math.abs(b.amount_cents - s.amount_cents) <= Math.abs(b.amount_cents) * 0.15,
        ),
    )
    .map((s) => {
      const c = s.category_id ? cats.get(s.category_id) : undefined;
      return { ...s, account: acct.get(s.account_id)?.name ?? null, category: c ? { name: c.name, icon: c.icon, color: c.color } : null };
    });
  return { today, bills, suggestions };
}

export type BillInput = {
  id?: string;
  name: string;
  note?: string | null;
  amountCents: number; // positive; saved as money out
  accountId: string | null;
  categoryId: string | null;
  cadence: "once" | "monthly";
  nextDate: ISODate;
  endDate?: ISODate | null;
  merchantKey?: string | null;
};

export async function saveBill(b: BillInput) {
  const { db } = await authed();
  const name = b.name.trim().slice(0, 60);
  if (!name) throw new Error("Give the bill a name.");
  if (!Number.isInteger(b.amountCents) || b.amountCents <= 0) throw new Error("Enter an amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.nextDate)) throw new Error("Pick the next due date.");
  if (b.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.endDate)) throw new Error("Pick a valid end date.");
  const row = {
    name,
    note: b.note?.trim().slice(0, 80) || null,
    amount_cents: -b.amountCents,
    account_id: b.accountId,
    category_id: b.categoryId,
    cadence: b.cadence,
    next_date: b.nextDate,
    end_date: b.cadence === "monthly" ? b.endDate || null : null,
    merchant_key: b.merchantKey ?? null,
    active: true,
    confirmed: true,
  };
  if (b.id) ok(await db.from("recurring_series").update(row).eq("id", b.id).select("id"));
  else ok(await db.from("recurring_series").insert(row).select("id"));
}

export async function setBillActive(id: string, active: boolean) {
  const { db } = await authed();
  ok(await db.from("recurring_series").update({ active }).eq("id", id).select("id"));
}

export async function deleteBill(id: string) {
  const { db } = await authed();
  ok(await db.from("recurring_series").delete().eq("id", id).select("id"));
}

export async function dismiss(key: string) {
  const { db } = await authed();
  if (!/^[a-z-]+:[\w :.-]{1,80}$/i.test(key)) throw new Error("Bad key");
  ok(await db.from("dismissals").upsert({ key }, { onConflict: "user_id,key" }).select("key"));
}

// ───────────────────────────── savings prompts + transfers (§7.1, §7.2) ─────────────────────────────

export async function getSavingsPrompts() {
  const { db, today } = await authed();
  const { thirdPaychequePrompt, monthEndPrompt } = await import("./savings-prompts");
  const [income, prof, dismissed] = await Promise.all([incomeSettings(db), profile(db), dismissedKeys(db)]);
  const out = [];
  if (income) {
    const p = thirdPaychequePrompt(income.schedule, income.paycheque, today);
    if (p && !dismissed.has(p.key)) out.push(p);
  }
  // Month-end: this month near its end, or last month during the first 5 days.
  const day = Number(today.slice(8));
  const month = day <= 5 ? monthKey(addMonths(today, -1)) : monthKey(today);
  const { end } = monthRange(month);
  if (day <= 5 || Date.parse(end) - Date.parse(today) <= 2 * 86_400_000) {
    const cats = await categories(db);
    const [rows, lines] = await Promise.all([monthLedger(db, month, cats), budgetLines(db, month)]);
    const status = budgetStatus(lines, spentByCategory(rows));
    const p = monthEndPrompt(month, status.spent, prof.monthlyBudget ?? status.budget, today);
    if (p && !dismissed.has(p.key)) out.push(p);
  }
  return out;
}

/** Records chequing → savings as a linked transfer pair (not spending), and marks the prompt done. */
export async function moveToSavings(amountCents: number, promptKey?: string) {
  const { db, today } = await authed();
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Enter an amount.");
  const [accts, cat] = await Promise.all([
    db.from("accounts").select("id,key").in("key", ["scotia_chequing", "scotia_savings"]).then(ok),
    db.from("categories").select("id").eq("key", "savings_xfer").maybeSingle().then(okMaybe),
  ]);
  const from = accts.find((a) => a.key === "scotia_chequing");
  const to = accts.find((a) => a.key === "scotia_savings");
  if (!from || !to) throw new Error("Chequing or savings account not found.");
  const [out] = ok(
    await db
      .from("transactions")
      .insert({ account_id: from.id, date: today, amount_cents: -amountCents, description: "To savings", category_id: cat?.id ?? null, is_transfer: true, source: "manual" })
      .select("id"),
  );
  const [inn] = ok(
    await db
      .from("transactions")
      .insert({ account_id: to.id, date: today, amount_cents: amountCents, description: "From chequing", category_id: cat?.id ?? null, is_transfer: true, source: "manual", transfer_pair_id: out.id })
      .select("id"),
  );
  ok(await db.from("transactions").update({ transfer_pair_id: inn.id }).eq("id", out.id).select("id"));
  if (promptKey) await dismiss(promptKey);
}

// ───────────────────────────── savings goals (§7.8) ─────────────────────────────

export async function getGoals() {
  const { db } = await authed();
  const [goals, bal] = await Promise.all([
    db.from("savings_goals").select("id,name,target_cents,monthly_contribution_cents,account_id,archived,created_at").eq("archived", false).order("created_at").then(ok),
    balances(db),
  ]);
  const savingsAccounts = bal.filter((b) => b.account_group === "cash_bank" && /savings/i.test(b.name));
  return {
    goals: goals.map((g) => {
      const linked = g.account_id ? bal.find((b) => b.account_id === g.account_id) : undefined;
      // The emergency fund stays private: progress is shown without its amount.
      const saved = linked && linked.account_group !== "cash_emergency" ? Math.max(0, linked.balance_cents) : null;
      return {
        id: g.id,
        name: g.name,
        target: Number(g.target_cents),
        monthly: Number(g.monthly_contribution_cents),
        accountId: g.account_id,
        account: linked?.name ?? null,
        saved,
      };
    }),
    accounts: savingsAccounts.map((a) => ({ id: a.account_id, name: a.name })),
  };
}

export async function saveGoal(g: { id?: string; name: string; targetCents: number; monthlyCents: number; accountId: string | null }) {
  const { db } = await authed();
  const name = g.name.trim().slice(0, 60);
  if (!name) throw new Error("Name the goal.");
  if (!Number.isInteger(g.targetCents) || g.targetCents <= 0) throw new Error("Enter a target.");
  if (!Number.isInteger(g.monthlyCents) || g.monthlyCents < 0) throw new Error("Enter a monthly amount.");
  const row = { name, target_cents: g.targetCents, monthly_contribution_cents: g.monthlyCents, account_id: g.accountId };
  if (g.id) ok(await db.from("savings_goals").update(row).eq("id", g.id).select("id"));
  else ok(await db.from("savings_goals").insert(row).select("id"));
}

export async function deleteGoal(id: string) {
  const { db } = await authed();
  ok(await db.from("savings_goals").delete().eq("id", id).select("id"));
}

/** Undo "received": the money is owed to you again. */
export async function unsettleOwed(id: string) {
  const { db } = await authed();
  ok(await db.from("shared_debts").update({ settled_at: null }).eq("id", id).select("id"));
}

// ───────────────────────────── investments (§3.3) ─────────────────────────────

export async function getInvestments() {
  const { db } = await authed();
  const [accounts, bal] = await Promise.all([
    db.from("accounts").select("id,name,institution,sort_order").eq("account_group", "investment").eq("archived", false).order("sort_order").then(ok),
    balances(db),
  ]);
  const ids = accounts.map((a) => a.id);
  const snaps = ids.length
    ? ok(await db.from("balance_snapshots").select("account_id,as_of,amount_cents").in("account_id", ids).order("as_of").limit(2000))
    : [];
  return accounts.map((a) => {
    const history = snaps.filter((s) => s.account_id === a.id).map((s) => ({ date: s.as_of as ISODate, cents: Number(s.amount_cents) }));
    return {
      id: a.id,
      name: a.name,
      institution: a.institution,
      value: bal.find((b) => b.account_id === a.id)?.balance_cents ?? 0,
      updated: history.length ? history[history.length - 1].date : null,
      history,
    };
  });
}

export async function addInvestmentAccount(input: { name: string; institution?: string; valueCents: number }) {
  const { db, today } = await authed();
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Name the account (e.g. TFSA).");
  if (!Number.isInteger(input.valueCents) || input.valueCents < 0) throw new Error("Enter the current value.");
  const key = `inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${Date.now().toString(36)}`;
  const [acct] = ok(
    await db
      .from("accounts")
      .insert({ key, name, institution: input.institution?.trim().slice(0, 60) || null, account_group: "investment", sort_order: 100 })
      .select("id"),
  );
  ok(await db.from("balance_snapshots").insert({ account_id: acct.id, as_of: today, amount_cents: input.valueCents, kind: "manual", note: "Starting value" }).select("id"));
}

/** Hide an investment account (its history is kept). */
export async function archiveInvestmentAccount(id: string) {
  const { db } = await authed();
  ok(await db.from("accounts").update({ archived: true }).eq("id", id).eq("account_group", "investment").select("id"));
}

// ───────────────────────────── rules, categories, splits (§5, §6) ─────────────────────────────

/** Owner rules: cleaned-merchant → category. Checked before the built-in suggestions. */
async function userRules(db: Db) {
  return ok(await db.from("rules").select("id,pattern,match_field,match_type,category_id,priority").eq("enabled", true).order("priority"));
}

export async function ruleCategoryFor(db: Db, description: string): Promise<string | null> {
  const { merchantKey } = await import("./recurring");
  const key = merchantKey(description);
  for (const r of await userRules(db)) {
    if (r.match_field === "merchant" && r.match_type === "equals" && r.pattern === key) return r.category_id;
    if (r.match_field === "description" && r.match_type === "contains" && description.toLowerCase().includes(r.pattern.toLowerCase())) return r.category_id;
  }
  return null;
}

/** "Always put <merchant> in <category>". Optionally re-categorizes past matching transactions. Returns how many were updated. */
export async function createMerchantRule(description: string, categoryId: string, applyToPast: boolean) {
  const { db } = await authed();
  const { merchantKey } = await import("./recurring");
  const key = merchantKey(description);
  if (!key) throw new Error("Can't make a rule for this one.");
  const cat = okMaybe(await db.from("categories").select("id,kind").eq("id", categoryId).maybeSingle());
  if (!cat) throw new Error("Category not found.");
  ok(await db.from("rules").delete().eq("match_field", "merchant").eq("pattern", key).select("id"));
  ok(await db.from("rules").insert({ match_field: "merchant", match_type: "equals", pattern: key, category_id: cat.id, priority: 10 }).select("id"));
  if (!applyToPast) return 0;
  const rows = ok(await db.from("transactions").select("id,description,category_id,transaction_splits(id)").limit(5000));
  const ids = rows.filter((r) => !r.transaction_splits.length && r.category_id !== cat.id && merchantKey(r.description) === key).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    ok(await db.from("transactions").update({ category_id: cat.id, is_transfer: cat.kind === "transfer" }).in("id", ids.slice(i, i + 200)).select("id"));
  }
  return ids.length;
}

export async function listRulesAndCategories() {
  const { db } = await authed();
  const [rules, cats, all] = await Promise.all([
    db.from("rules").select("id,pattern,match_field,category_id,created_at").order("created_at", { ascending: false }).then(ok),
    db.from("categories").select("id,key,name,kind,essential,parent_id,archived,icon,color,sort_order").order("sort_order").then(ok),
    db.from("transactions").select("category_id").not("category_id", "is", null).limit(5000).then(ok),
  ]);
  const uses = new Map<string, number>();
  for (const t of all) uses.set(t.category_id!, (uses.get(t.category_id!) ?? 0) + 1);
  const parents = cats.filter((c) => !c.parent_id);
  return {
    rules: rules.map((r) => ({ id: r.id, merchant: r.pattern, category: cats.find((c) => c.id === r.category_id)?.name ?? "—" })),
    groups: parents.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      icon: p.icon,
      color: p.color,
      children: cats
        .filter((c) => c.parent_id === p.id)
        .map((c) => ({ id: c.id, name: c.name, essential: c.essential, archived: c.archived, icon: c.icon, color: c.color, uses: uses.get(c.id) ?? 0 })),
    })),
  };
}

export async function deleteRule(id: string) {
  const { db } = await authed();
  ok(await db.from("rules").delete().eq("id", id).select("id"));
}

export async function renameCategory(id: string, name: string) {
  const { db } = await authed();
  const n = name.trim().slice(0, 50);
  if (!n) throw new Error("Enter a name.");
  ok(await db.from("categories").update({ name: n }).eq("id", id).select("id"));
}

export async function setCategoryArchived(id: string, archived: boolean) {
  const { db } = await authed();
  ok(await db.from("categories").update({ archived }).eq("id", id).not("parent_id", "is", null).select("id"));
}

/** New subcategory under a parent (inherits its kind and color). */
export async function addCategory(parentId: string, name: string, essential: "fixed" | "variable" | null) {
  const { db } = await authed();
  const n = name.trim().slice(0, 50);
  if (!n) throw new Error("Enter a name.");
  const parent = okMaybe(await db.from("categories").select("id,kind,color,icon").eq("id", parentId).is("parent_id", null).maybeSingle());
  if (!parent) throw new Error("Pick a group.");
  const key = `c_${n.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${Date.now().toString(36)}`;
  ok(
    await db
      .from("categories")
      .insert({ key, name: n, parent_id: parent.id, kind: parent.kind, essential: parent.kind === "expense" ? essential : null, color: parent.color, icon: parent.icon, sort_order: 500 })
      .select("id"),
  );
}

/** Split a transaction across categories. Line amounts are positive and must add up to the total. */
export async function saveSplits(transactionId: string, lines: { categoryId: string; cents: number }[]) {
  const { db } = await authed();
  const tx = okMaybe(await db.from("transactions").select("id,amount_cents").eq("id", transactionId).maybeSingle());
  if (!tx) throw new Error("Transaction not found.");
  const clean = checkSplitLines(lines, Math.abs(Number(tx.amount_cents)));
  await replaceSplits(db, tx.id, Number(tx.amount_cents) < 0 ? -1 : 1, clean);
  ok(await db.from("transactions").update({ category_id: null }).eq("id", tx.id).select("id"));
}

/** Undo a split: back to one category. */
export async function removeSplits(transactionId: string, categoryId: string | null) {
  const { db } = await authed();
  ok(await db.from("transaction_splits").delete().eq("transaction_id", transactionId).select("id"));
  ok(await db.from("transactions").update({ category_id: categoryId }).eq("id", transactionId).select("id"));
}

// ───────────────────────────── Claude connector links (phase 8) ─────────────────────────────

export async function createConnectorToken(name: string) {
  const { db } = await authed();
  const { newToken, hashToken } = await import("./mcp/auth");
  const token = newToken();
  ok(await db.from("api_tokens").insert({ name: name.trim().slice(0, 40) || "Claude", token_hash: hashToken(token) }).select("id"));
  return token;
}

export async function listConnectorTokens() {
  const { db } = await authed();
  return ok(await db.from("api_tokens").select("id,name,created_at,last_used_at,revoked_at").order("created_at", { ascending: false }));
}

export async function revokeConnectorToken(id: string) {
  const { db } = await authed();
  ok(await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).select("id"));
  const { forgetSessions } = await import("./mcp/auth");
  forgetSessions();
}

// ───────────────────────────── Claude (MCP) drafts → confirm ─────────────────────────────

export type DraftItemInput = {
  type: "expense" | "income";
  amount: number; // dollars
  category?: string;
  account?: string;
  date?: string;
  note?: string;
  split?: { category: string; amount: number }[];
  friend_owes?: { person: string; amount: number };
};

type DraftItem = {
  kind: "expense" | "income";
  cents: number;
  categoryId: string | null;
  category: string;
  accountId: string;
  account: string;
  date: ISODate;
  note: string | null;
  splits: { categoryId: string; category: string; cents: number }[];
  owes: { person: string; cents: number } | null;
};

const dollars = (c: number) => "$" + (c / 100).toFixed(2);

const toCentsStrict = (d: number) => {
  if (typeof d !== "number" || !Number.isFinite(d) || d <= 0 || d > 1_000_000) throw new Error("Invalid amount: " + d);
  return Math.round(d * 100);
};

/** Resolves names → ids and stores a draft. Saves no transactions. */
export async function draftTransactions(items: DraftItemInput[]) {
  const { db, today } = await authed();
  const { resolveAccount, resolveName } = await import("./mcp/resolve");
  if (!items.length || items.length > 25) throw new Error("Send between 1 and 25 items.");
  const [opts, prof] = await Promise.all([getEditOptions(), db.from("profiles").select("last_account_id").maybeSingle().then(okMaybe)]);
  const problems: string[] = [];
  const out: DraftItem[] = [];
  items.forEach((it, n) => {
    const tag = "Item " + (n + 1);
    try {
      const cents = toCentsStrict(it.amount);
      const kind = it.type === "income" ? "income" : "expense";
      const pool = opts.categories.filter((c) => c.kind === kind);
      const last = prof?.last_account_id ? opts.accounts.find((a) => a.id === prof.last_account_id) : undefined;
      const acct = it.account
        ? resolveAccount(it.account, opts.accounts)
        : last
          ? { ok: true as const, id: last.id, name: last.name }
          : { ok: false as const, options: opts.accounts.map((a) => a.name) };
      if (!acct.ok) return void problems.push(tag + ": which account? " + acct.options.join(" / "));
      const splits: DraftItem["splits"] = [];
      for (const s of it.split ?? []) {
        const r = resolveName(s.category, pool);
        if (!r.ok) return void problems.push(tag + ': split category "' + s.category + '" is unclear. Options: ' + r.options.slice(0, 8).join(" / "));
        splits.push({ categoryId: r.id, category: r.name, cents: toCentsStrict(s.amount) });
      }
      const splitSum = splits.reduce((t, s) => t + s.cents, 0);
      if (splits.length && splitSum !== cents) return void problems.push(tag + ": split lines add up to " + dollars(splitSum) + ", not " + dollars(cents));
      let categoryId: string | null = null;
      let category = splits.length ? "Split" : "Uncategorized";
      if (!splits.length) {
        if (!it.category) return void problems.push(tag + ": which category?");
        const r = resolveName(it.category, pool);
        if (!r.ok) return void problems.push(tag + ': category "' + it.category + '" is unclear. Options: ' + r.options.slice(0, 8).join(" / "));
        categoryId = r.id;
        category = r.name;
      }
      const date = it.date && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : today;
      if (date > today) return void problems.push(tag + ": date " + date + " is in the future");
      const owes = it.friend_owes ? { person: it.friend_owes.person.trim().slice(0, 60), cents: toCentsStrict(it.friend_owes.amount) } : null;
      if (owes && (!owes.person || owes.cents > cents)) return void problems.push(tag + ": friend_owes needs a name and can't exceed the amount");
      out.push({ kind, cents, categoryId, category, accountId: acct.id, account: acct.name, date, note: it.note?.trim().slice(0, 200) || null, splits, owes });
    } catch (e) {
      problems.push(tag + ": " + (e as Error).message);
    }
  });
  if (problems.length) return { ok: false as const, problems };
  const lines = out.map(
    (d) =>
      (d.kind === "expense" ? "−" : "+") +
      dollars(d.cents) +
      " · " +
      d.category +
      (d.splits.length ? " (" + d.splits.map((s) => s.category + " " + dollars(s.cents)).join(" + ") + ")" : "") +
      " · " +
      d.account +
      " · " +
      d.date +
      (d.note ? ' · "' + d.note + '"' : "") +
      (d.owes ? " · " + d.owes.person + " owes " + dollars(d.owes.cents) : ""),
  );
  const [draft] = ok(await db.from("mcp_drafts").insert({ payload: { items: out }, summary: lines.join("\n") }).select("id"));
  return { ok: true as const, draftId: draft.id, preview: lines };
}

/** Saves a draft (only after the owner said yes). Single use, expires after 24h. */
export async function confirmDraft(id: string) {
  const { db } = await authed();
  const d = okMaybe(await db.from("mcp_drafts").select("id,payload,confirmed_at,discarded_at,created_at").eq("id", id).maybeSingle());
  if (!d) throw new Error("Draft not found.");
  if (d.confirmed_at) throw new Error("This draft was already saved.");
  if (d.discarded_at) throw new Error("This draft was discarded.");
  if (Date.now() - Date.parse(d.created_at) > 24 * 3_600_000) throw new Error("This draft expired. Make a new one.");
  // Claim it first, so a double confirm can't save twice.
  const claimed = ok(await db.from("mcp_drafts").update({ confirmed_at: new Date().toISOString() }).eq("id", id).is("confirmed_at", null).select("id"));
  if (!claimed.length) throw new Error("This draft was already saved.");
  const change = (d.payload as unknown as { change?: unknown }).change;
  if (change) {
    const { applyChange } = await import("./mcp/changes");
    return [await applyChange(change)];
  }
  const transfer = (d.payload as unknown as { transfer?: { fromId: string; toId: string; cents: number; date: ISODate; note: string | null; from: string; to: string } }).transfer;
  if (transfer) {
    await createTransfer(transfer);
    return [dollars(transfer.cents) + " transfer: " + transfer.from + " → " + transfer.to];
  }
  const items = (d.payload as unknown as { items: DraftItem[] }).items;
  const saved: string[] = [];
  for (const it of items) {
    const amount = it.kind === "expense" ? -it.cents : it.cents;
    const [tx] = ok(
      await db
        .from("transactions")
        .insert({ account_id: it.accountId, date: it.date, amount_cents: amount, description: it.note ?? it.category, note: it.note, category_id: it.splits.length ? null : it.categoryId, source: "mcp" })
        .select("id"),
    );
    if (it.splits.length) {
      ok(await db.from("transaction_splits").insert(it.splits.map((s) => ({ transaction_id: tx.id, category_id: s.categoryId, amount_cents: (amount < 0 ? -1 : 1) * s.cents }))).select("id"));
    }
    if (it.owes) ok(await db.from("shared_debts").insert({ person: it.owes.person, amount_cents: it.owes.cents, transaction_id: tx.id }).select("id"));
    saved.push((it.kind === "expense" ? "−" : "+") + dollars(it.cents) + " " + it.category + " (" + it.account + ")");
  }
  return saved;
}

export async function discardDraft(id: string) {
  const { db } = await authed();
  ok(await db.from("mcp_drafts").update({ discarded_at: new Date().toISOString() }).eq("id", id).is("confirmed_at", null).select("id"));
}

/** Draft a card payment / bank-to-bank move for Claude. Saves nothing. */
export async function draftTransfer(input: { from?: string; to: string; amount: number; date?: string; note?: string }) {
  const { db, today } = await authed();
  const { resolveAccount } = await import("./mcp/resolve");
  const o = await getQuickAddOptions();
  const cents = toCentsStrict(input.amount);
  const fromR = resolveAccount(input.from ?? "chequing", o.transferFrom);
  const toR = resolveAccount(input.to, o.transferTo);
  const problems: string[] = [];
  if (!fromR.ok) problems.push("From which bank account? " + fromR.options.join(" / "));
  if (!toR.ok) problems.push("To which card or account? " + toR.options.join(" / "));
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today;
  if (date > today) problems.push("Date " + date + " is in the future");
  if (!fromR.ok || !toR.ok || problems.length) return { ok: false as const, problems };
  if (fromR.id === toR.id) return { ok: false as const, problems: ["From and to are the same account."] };
  const transfer = { fromId: fromR.id, toId: toR.id, cents, date, note: input.note?.trim().slice(0, 200) || null, from: fromR.name, to: toR.name };
  const line = dollars(cents) + " · " + fromR.name + " → " + toR.name + " · " + date + " (transfer: not spending)";
  const [draft] = ok(await db.from("mcp_drafts").insert({ payload: { transfer }, summary: line }).select("id"));
  return { ok: true as const, draftId: draft.id, preview: [line] };
}

/** Store any change for Claude to confirm later (see mcp/changes.ts). Saves nothing else. */
export async function storeChangeDraft(change: unknown, preview: string[]) {
  const { db } = await authed();
  const [draft] = ok(await db.from("mcp_drafts").insert({ payload: { change } as never, summary: preview.join("\n") }).select("id"));
  return draft.id;
}

/** One transaction, readable, for "before → after" previews. */
export async function getTransactionBrief(id: string) {
  const { db } = await authed();
  const t = okMaybe(
    await db
      .from("transactions")
      .select("id,date,amount_cents,description,note,category_id,account_id,is_transfer,source,transfer_pair_id,account:accounts!transactions_account_id_fkey(name),category:categories(name),transaction_splits(id)")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!t) return null;
  return {
    id: t.id,
    date: t.date as ISODate,
    transferPairId: t.transfer_pair_id,
    amount_cents: Number(t.amount_cents),
    description: t.description,
    note: t.note,
    categoryId: t.category_id,
    category: t.category?.name ?? (t.transaction_splits.length ? "Split" : "Uncategorized"),
    accountId: t.account_id,
    account: t.account?.name ?? "",
    isTransfer: t.is_transfer,
    split: t.transaction_splits.length > 0,
  };
}

/** Accounts Claude may act on (never the private emergency fund). */
export async function listAccountsForChanges() {
  const { db } = await authed();
  return ok(
    await db.from("accounts").select("id,key,name,account_group").eq("archived", false).not("account_group", "in", "(legacy,cash_emergency)").order("sort_order"),
  ).map((a) => ({ id: a.id, name: a.name, group: a.account_group, key: a.key }));
}
