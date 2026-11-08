import "server-only";
import { cacheLife } from "next/cache";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { budgetStatus, type BudgetLineDef } from "./budget";
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
export const HISTORY = { key: "2025", start: "2024-12-01", end: "2025-12-31", label: "Dec 2024 – Dec 2025" } as const;

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

/** A ledger line: a transaction, or one split line of it. */
export type LedgerRow = TxRow & { id: string; date: ISODate; description: string; account: string; split: boolean };

/** All rows dated in [start, end], with split transactions expanded into their lines. */
async function ledger(db: Db, start: ISODate, end: ISODate, cats: Map<string, CategoryInfo>): Promise<LedgerRow[]> {
  const rows = ok(
    await db
      .from("transactions")
      .select(
        "id,date,description,amount_cents,is_transfer,in_reports,category_id,account:accounts!transactions_account_id_fkey(name),transaction_splits(id,category_id,amount_cents,note)",
      )
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false })
      .limit(5000),
  );
  const out: LedgerRow[] = [];
  for (const r of rows) {
    const base = {
      date: r.date as ISODate,
      description: r.description,
      account: r.account?.name ?? "",
      is_transfer: r.is_transfer,
      in_reports: r.in_reports,
    };
    if (r.transaction_splits.length) {
      for (const s of r.transaction_splits) {
        out.push({
          ...base,
          id: s.id,
          split: true,
          description: s.note ? `${r.description} · ${s.note}` : r.description,
          amount_cents: Number(s.amount_cents),
          category: s.category_id ? (cats.get(s.category_id) ?? null) : null,
        });
      }
    } else {
      out.push({
        ...base,
        id: r.id,
        split: false,
        amount_cents: Number(r.amount_cents),
        category: r.category_id ? (cats.get(r.category_id) ?? null) : null,
      });
    }
  }
  return out;
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
export type CategoryTx = { id: string; date: ISODate; description: string; account: string; amount_cents: number; split: boolean };

function byCategory(rows: readonly LedgerRow[]): Record<string, CategoryTx[]> {
  const out: Record<string, CategoryTx[]> = {};
  for (const r of rows) {
    if (!r.in_reports || r.is_transfer) continue;
    const k = r.category?.id ?? "__none";
    (out[k] ??= []).push({ id: r.id, date: r.date, description: r.description, account: r.account, amount_cents: r.amount_cents, split: r.split });
  }
  return out;
}

// ───────────────────────────── screens ─────────────────────────────

export async function getHome() {
  const { db, today } = await session();
  const month = monthKey(today);
  const cats = await categories(db);
  const [bal, rows, income, bills, lines] = await Promise.all([
    balances(db),
    monthLedger(db, month, cats),
    incomeSettings(db),
    upcoming(db, today, cats),
    budgetLines(db, month),
  ]);
  const { end } = monthRange(month);
  const bank = bal.filter((b) => b.account_group === "cash_bank");
  const debts = bal.filter(isDebt);
  const investments = bal.filter((b) => b.account_group === "investment");
  const status = budgetStatus(lines, spentByCategory(rows));

  return {
    today,
    month,
    daysLeft: Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000) + 1,
    spent: status.spent,
    budget: status.budget,
    band: status.band,
    nextPayday: income ? nextPayday(income.schedule, today).paid : null,
    cash: bank.reduce((s, b) => s + b.balance_cents, 0),
    debts: -debts.reduce((s, b) => s + b.balance_cents, 0),
    debtCounts: {
      cards: debts.filter((d) => d.account_group === "debt_card").length,
      plans: debts.filter((d) => d.account_group === "debt_loan" && d.balance_cents !== 0).length,
    },
    investments: investments.reduce((s, b) => s + b.balance_cents, 0),
    investmentCount: investments.length,
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
  const [rows, prevRows, lines] = await Promise.all([
    monthLedger(db, month, cats),
    prev >= FIRST_MONTH ? monthLedger(db, prev, cats) : Promise.resolve([]),
    budgetLines(db, month),
  ]);
  const summary = summarize(rows);
  const before = summarize(prevRows);
  return {
    month,
    isCurrent: month === monthKey(today),
    isFuture: month > monthKey(today),
    summary,
    budget: budgetStatus(lines, spentByCategory(rows)),
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
  // Month by month (Dec 2024 … Dec 2025).
  const months: { month: MonthKey; income: number; spent: number }[] = [];
  for (let m = monthKey(HISTORY.start); m <= monthKey(HISTORY.end); m = monthKey(addMonths(`${m}-01`, 1))) {
    const s = summarize(rows.filter((r) => r.date.startsWith(m)));
    months.push({ month: m, income: s.income, spent: s.spent });
  }
  const recorded = months.filter((m) => m.spent > 0 || m.income > 0);
  const biggest = rows
    .filter((r) => r.in_reports && !r.is_transfer && r.amount_cents < 0 && r.category?.kind !== "transfer")
    .sort((a, b) => a.amount_cents - b.amount_cents)
    .slice(0, 5)
    .map((r) => ({ id: r.id, date: r.date, description: r.description, amount_cents: r.amount_cents, category: r.category }));
  return {
    summary,
    months,
    monthsRecorded: recorded.length,
    avgSpent: recorded.length ? Math.round(summary.spent / recorded.length) : 0,
    avgIncome: recorded.length ? Math.round(summary.income / recorded.length) : 0,
    biggest,
    transactions: byCategory(rows),
  };
}

export async function getBudgets(month?: MonthKey) {
  const { db, today } = await session();
  const m = month ?? monthKey(today);
  const cats = await categories(db);
  const [rows, lines] = await Promise.all([monthLedger(db, m, cats), budgetLines(db, m)]);
  const { end } = monthRange(m);
  return {
    month: m,
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
