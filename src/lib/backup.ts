import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";
import type { Database } from "@/lib/database.types";
import { toCsv } from "@/lib/csv";
import type { ISODate } from "@/lib/dates";

type Db = SupabaseClient<Database>;
type Table = keyof Database["public"]["Tables"];

/**
 * Backup (owner, Nov 11 2026): everything needed to rebuild Kharcha-Paani, as
 * one zip with
 *   backup.json      every table, exactly as stored (amounts in cents)
 *   transactions.csv one row per transaction, in dollars, for a spreadsheet
 *   accounts.csv     each account and its balance on the day
 *   README.txt       what's what
 * Left out: the PIN's hash and lockout counters, Claude connector tokens and
 * Claude's drafts (secrets, or throwaway).
 * Every query filters by user_id, so this is safe with the service-role client
 * (weekly email) as well as a signed-in one (Settings export).
 */
const TABLES: { table: Table; columns?: string; order?: string }[] = [
  { table: "profiles", columns: "user_id,display_name,last_account_id,monthly_budget_cents,updated_at", order: "user_id" },
  { table: "accounts" },
  { table: "balance_snapshots" },
  { table: "categories" },
  { table: "transactions" },
  { table: "transaction_splits" },
  { table: "shared_debts" },
  { table: "budget_lines" },
  { table: "budget_line_categories", order: "line_id,category_id" },
  { table: "budgets" },
  { table: "recurring_series" },
  { table: "rules" },
  { table: "merchants" },
  { table: "savings_goals" },
  { table: "income_settings", order: "user_id" },
  { table: "paycheques" },
  { table: "imports" },
  { table: "dismissals", order: "key" },
];

const PAGE = 1000;

async function all(db: Db, table: Table, userId: string, columns = "*", order = "id") {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    // A stable order, so pages don't skip or repeat rows.
    let q = db.from(table).select(columns).eq("user_id", userId);
    for (const col of order.split(",")) q = q.order(col);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const dollars = (cents: unknown) => (Number(cents) / 100).toFixed(2);

/** `balances`: each account's balance in cents, as the app shows it (appBalances in data.ts). */
export async function buildBackup(db: Db, userId: string, today: ISODate, balances: Map<string, number>) {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) data[t.table] = await all(db, t.table, userId, t.columns, t.order);

  const byId = <T extends Record<string, unknown>>(rows: T[]) => new Map(rows.map((r) => [r.id as string, r]));
  const accounts = byId(data.accounts);
  const cats = byId(data.categories);
  const catName = (id: unknown) => {
    const c = id ? cats.get(id as string) : undefined;
    if (!c) return "";
    const parent = c.parent_id ? cats.get(c.parent_id as string) : undefined;
    return parent ? `${parent.name} / ${c.name}` : String(c.name);
  };
  const splitsByTx = new Map<string, Record<string, unknown>[]>();
  for (const s of data.transaction_splits) splitsByTx.set(s.transaction_id as string, [...(splitsByTx.get(s.transaction_id as string) ?? []), s]);

  const txs = [...data.transactions].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)));
  const transactionsCsv = toCsv([
    ["date", "posted", "account", "category", "amount", "description", "note", "transfer", "split", "counts_in_reports", "source", "id"],
    ...txs.map((t) => [
      t.date as string,
      (t.posted_date as string | null) ?? "",
      String(accounts.get(t.account_id as string)?.name ?? ""),
      catName(t.category_id),
      dollars(t.amount_cents),
      t.description as string,
      (t.note as string | null) ?? "",
      t.is_transfer ? "yes" : "",
      (splitsByTx.get(t.id as string) ?? []).map((s) => `${catName(s.category_id)}: ${dollars(s.amount_cents)}`).join("; "),
      t.in_reports ? "yes" : "no",
      t.source as string,
      t.id as string,
    ]),
  ]);
  // Old history containers (legacy) have no balance; they're left blank.
  const accountsCsv = toCsv([
    ["name", "institution", "type", "last4", "balance", "archived", "id"],
    ...data.accounts.map((a) => [
      a.name as string,
      (a.institution as string | null) ?? "",
      a.account_group as string,
      (a.last4 as string | null) ?? "",
      balances.has(a.id as string) ? dollars(balances.get(a.id as string)) : "",
      a.archived ? "yes" : "",
      a.id as string,
    ]),
  ]);

  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const json = JSON.stringify({ app: "Kharcha-Paani", version: 1, exportedOn: today, amounts: "integer cents, negative = money out", counts, tables: data }, null, 1);
  const readme = [
    `Kharcha-Paani backup, ${today}`,
    "",
    "backup.json       Every table as stored, enough to rebuild the app. Amounts are in cents (negative = money out).",
    "transactions.csv  All transactions in dollars, newest first. Opens in Numbers, Excel or Google Sheets.",
    "accounts.csv      Your accounts and their balances on the day of the backup.",
    "",
    `${counts.transactions} transactions, ${counts.accounts} accounts, ${counts.categories} categories.`,
    "Not included: your PIN, Claude connector links.",
    "",
  ].join("\n");

  const dir = `kharcha-paani-backup-${today}`;
  const zip = zipSync(
    {
      [`${dir}/README.txt`]: strToU8(readme),
      [`${dir}/backup.json`]: strToU8(json),
      [`${dir}/transactions.csv`]: strToU8(transactionsCsv),
      [`${dir}/accounts.csv`]: strToU8(accountsCsv),
    },
    { level: 9 },
  );
  return { fileName: `${dir}.zip`, zip, counts };
}
