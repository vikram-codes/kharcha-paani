import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addMonths, monthKey, monthRange, todayISO, type ISODate, type MonthKey } from "./dates";
import { loanState, payoffMonth } from "./loan";
import { nextPayday, type HolidayRule } from "./paydays";
import { summarize, type CategoryInfo, type TxRow } from "./summary";

/**
 * Data Access Layer. Every read goes through here with the owner's session,
 * so RLS applies. Must be called from behind a <Suspense> boundary.
 */
async function session() {
  // Request-time only: the session, "today" and Supabase's token-expiry checks all use the clock.
  await connection();
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
    await db
      .from("account_balances")
      .select("account_id,key,name,account_group,hidden,balance_cents")
      .neq("account_group", "legacy"),
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

async function monthRows(db: Db, month: MonthKey, cats: Map<string, CategoryInfo>): Promise<TxRow[]> {
  const { start, end } = monthRange(month);
  const rows = ok(
    await db
      .from("transactions")
      .select("amount_cents,is_transfer,in_reports,category_id")
      .gte("date", start)
      .lte("date", end),
  );
  return rows.map((r) => ({
    amount_cents: Number(r.amount_cents),
    is_transfer: r.is_transfer,
    in_reports: r.in_reports,
    category: r.category_id ? (cats.get(r.category_id) ?? null) : null,
  }));
}

async function incomeSettings(db: Db) {
  const s = okMaybe(await db.from("income_settings").select("net_paycheque_cents,anchor_payday,frequency_days,holiday_rule").maybeSingle());
  if (!s) return null;
  return {
    paycheque: Number(s.net_paycheque_cents),
    plannedMonthly: 2 * Number(s.net_paycheque_cents), // always 2; a 3rd goes to savings (§7.1)
    schedule: { anchor: s.anchor_payday as ISODate, everyDays: s.frequency_days as number, rule: s.holiday_rule as HolidayRule },
  };
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

// ───────────────────────────── screens ─────────────────────────────

export async function getHome() {
  const { db, today } = await session();
  const cats = await categories(db);
  const [bal, rows, income, bills] = await Promise.all([
    balances(db),
    monthRows(db, monthKey(today), cats),
    incomeSettings(db),
    upcoming(db, today, cats),
  ]);
  const month = monthKey(today);
  const { end } = monthRange(month);
  const bank = bal.filter((b) => b.account_group === "cash_bank");
  const debts = bal.filter(isDebt);
  const investments = bal.filter((b) => b.account_group === "investment");

  return {
    today,
    month,
    daysLeft: Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000) + 1,
    spent: summarize(rows).spent,
    plannedIncome: income?.plannedMonthly ?? null,
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

export async function getMonthSummary(month: MonthKey) {
  const { db, today } = await session();
  const cats = await categories(db);
  const prev = monthKey(addMonths(`${month}-01`, -1));
  const [rows, prevRows, income] = await Promise.all([monthRows(db, month, cats), monthRows(db, prev, cats), incomeSettings(db)]);
  const summary = summarize(rows);
  const before = summarize(prevRows);
  const prevByCat = new Map(before.expenses.map((e) => [e.category?.id ?? "__none", e.cents]));
  return {
    month,
    isCurrent: month === monthKey(today),
    isFuture: month > monthKey(today),
    plannedIncome: income?.plannedMonthly ?? null,
    summary,
    previous: { spent: before.spent, income: before.income },
    prevByCat,
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
      institution: (m?.institution as string | null) ?? null,
      last4: (m?.last4 as string | null) ?? null,
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
    loanPaid: loan?.paid ?? null,
  };
}

export async function getStudentLoan() {
  const { db, today } = await session();
  return getLoanFor(db, today, await balances(db));
}

async function getLoanFor(db: Db, today: ISODate, bal: Balance[]) {
  const acct = bal.find((b) => b.key === "student_loan");
  if (!acct) return null;
  const [meta, snap, pays, bill] = await Promise.all([
    ok(await db.from("accounts").select("apr").eq("id", acct.account_id).single()),
    ok(
      await db.from("balance_snapshots").select("as_of,amount_cents,native_amount,fx_rate")
        .eq("account_id", acct.account_id).order("as_of", { ascending: false }).limit(1).single(),
    ),
    ok(await db.from("transactions").select("date,amount_cents").eq("pays_account_id", acct.account_id).order("date")),
    okMaybe(await db.from("recurring_series").select("amount_cents").eq("pays_account_id", acct.account_id).eq("active", true).limit(1).maybeSingle()),
  ]);
  const apr = Number(meta.apr ?? 0);
  const payments = pays.map((p) => ({ date: p.date as ISODate, cents: -Number(p.amount_cents) }));
  const state = loanState({ anchorOwed: -Number(snap.amount_cents), anchorDate: snap.as_of, aprPct: apr, payments, today });
  const paid = payments.reduce((s, p) => s + p.cents, 0);
  const monthlyPayment = bill ? -Number(bill.amount_cents) : 0;
  return {
    name: acct.name,
    owed: state.owed,
    paid,
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
