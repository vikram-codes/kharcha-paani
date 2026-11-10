import "server-only";
import {
  addInvestmentAccount,
  addOwed,
  archiveInvestmentAccount,
  createMerchantRule,
  deleteBill,
  deleteGoal,
  deleteOwed,
  deleteRule,
  deleteTransaction,
  getBills,
  getBudgets,
  getEditOptions,
  getGoals,
  getInvestments,
  getTransactionBrief,
  listAccountsForChanges,
  listOwed,
  listRulesAndCategories,
  reconcileAccount,
  removeSplits,
  saveBill,
  saveGoal,
  saveSplits,
  setBillActive,
  setBudgetLines,
  setMonthlyBudget,
  settleOwed,
  storeChangeDraft,
  unsettleOwed,
  updateTransaction,
} from "@/lib/data";
import { cleanMerchant } from "@/lib/merchant";
import { resolveAccount, resolveName } from "./resolve";

/**
 * Every change Claude can make, as a two-step: draft*() works out exactly what
 * will happen (with a before → after preview) and stores it; applyChange() runs
 * it only after the owner confirms. Nothing here touches the emergency fund.
 */
type Change =
  | { kind: "edit_tx"; id: string; patch: { amountCents: number; categoryId: string | null; accountId: string; date: string; note: string | null } }
  | { kind: "delete_tx"; ids: string[] }
  | { kind: "split_tx"; id: string; lines: { categoryId: string; cents: number }[] }
  | { kind: "unsplit_tx"; id: string; categoryId: string | null }
  | { kind: "set_balance"; accountId: string; cents: number }
  | { kind: "owed_add"; person: string; cents: number; note: string | null; transactionId: string | null }
  | { kind: "owed_received" | "owed_undo" | "owed_remove"; id: string }
  | { kind: "bill_save"; bill: Parameters<typeof saveBill>[0] }
  | { kind: "bill_active"; id: string; active: boolean }
  | { kind: "bill_delete"; id: string }
  | { kind: "budget"; month: string; totalCents: number | null; lines: { id: string; cents: number }[] }
  | { kind: "rule_add"; description: string; categoryId: string; applyToPast: boolean }
  | { kind: "rule_delete"; id: string }
  | { kind: "goal_save"; goal: Parameters<typeof saveGoal>[0] }
  | { kind: "goal_delete"; id: string }
  | { kind: "inv_add"; name: string; institution: string | null; cents: number }
  | { kind: "inv_value"; accountId: string; cents: number }
  | { kind: "inv_remove"; accountId: string };

export type DraftResult = { ok: true; draftId: string; preview: string[] } | { ok: false; problems: string[] };

const money = (c: number) => (c < 0 ? "−" : "") + "$" + (Math.abs(c) / 100).toFixed(2);
const cents = (d: number) => {
  if (typeof d !== "number" || !Number.isFinite(d) || d < 0 || d > 10_000_000) throw new Error("Invalid amount: " + d);
  return Math.round(d * 100);
};
const no = (...problems: string[]): DraftResult => ({ ok: false, problems });
async function draft(change: Change, preview: string[]): Promise<DraftResult> {
  return { ok: true, draftId: await storeChangeDraft(change, preview), preview };
}
const pick = <T extends { id: string; name: string }>(what: string, q: string, items: T[]) => {
  const r = resolveName(q, items);
  return r.ok ? { id: r.id, name: r.name } : { problem: `Which ${what}? "${q}" matches: ${r.options.slice(0, 10).join(" / ") || "nothing"}` };
};

// ───────────────────────────── transactions ─────────────────────────────

export async function draftEditTransaction(a: {
  id: string;
  amount?: number;
  type?: "expense" | "income";
  category?: string;
  account?: string;
  date?: string;
  note?: string | null;
}): Promise<DraftResult> {
  const t = await getTransactionBrief(a.id);
  if (!t) return no("Transaction not found. Use list_transactions to get its id.");
  const opts = await getEditOptions();
  const accounts = await listAccountsForChanges();
  let categoryId = t.categoryId;
  let category = t.category;
  if (a.category !== undefined) {
    if (t.split) return no("This transaction is split. Use draft_split_transaction to change its categories.");
    const r = pick("category", a.category, opts.categories.map((c) => ({ id: c.id, name: c.name, parent: c.parent })));
    if ("problem" in r) return no(r.problem!);
    categoryId = r.id;
    category = r.name;
  }
  let accountId = t.accountId;
  let account = t.account;
  if (a.account !== undefined) {
    const r = resolveAccount(a.account, accounts);
    if (!r.ok) return no(`Which account? ${r.options.join(" / ")}`);
    accountId = r.id;
    account = r.name;
  }
  const sign = a.type ? (a.type === "income" ? 1 : -1) : Math.sign(t.amount_cents) || -1;
  const amountCents = a.amount !== undefined ? sign * cents(a.amount) : a.type ? sign * Math.abs(t.amount_cents) : t.amount_cents;
  if (amountCents === 0) return no("Amount can't be zero.");
  if (t.split && amountCents !== t.amount_cents) return no("This transaction is split: remove the split first (draft_split_transaction with unsplit) before changing its amount.");
  const date = a.date ?? t.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return no("Date must be YYYY-MM-DD.");
  const note = a.note === undefined ? t.note : a.note?.trim() || null;
  const what = t.note || cleanMerchant(t.description);
  const diffs = [
    amountCents !== t.amount_cents && `amount ${money(t.amount_cents)} → ${money(amountCents)}`,
    categoryId !== t.categoryId && `category ${t.category} → ${category}`,
    accountId !== t.accountId && `account ${t.account} → ${account}`,
    date !== t.date && `date ${t.date} → ${date}`,
    note !== t.note && `note "${t.note ?? ""}" → "${note ?? ""}"`,
  ].filter(Boolean) as string[];
  if (!diffs.length) return no("Nothing would change.");
  return draft({ kind: "edit_tx", id: t.id, patch: { amountCents, categoryId, accountId, date, note } }, [`Edit ${t.date} ${what} (${money(t.amount_cents)}, ${t.account}): ${diffs.join("; ")}`]);
}

export async function draftDeleteTransactions(ids: string[]): Promise<DraftResult> {
  const lines: string[] = [];
  for (const id of ids) {
    const t = await getTransactionBrief(id);
    if (!t) return no(`Transaction ${id} not found.`);
    lines.push(`Delete ${t.date} ${t.note || cleanMerchant(t.description)} ${money(t.amount_cents)} · ${t.category} · ${t.account}${t.transferPairId ? " (and the other side of this transfer)" : ""}`);
  }
  return draft({ kind: "delete_tx", ids }, lines);
}

export async function draftSplitTransaction(a: { id: string; lines?: { category: string; amount: number }[]; unsplit_to_category?: string }): Promise<DraftResult> {
  const t = await getTransactionBrief(a.id);
  if (!t) return no("Transaction not found.");
  const opts = await getEditOptions();
  const cats = opts.categories.map((c) => ({ id: c.id, name: c.name, parent: c.parent }));
  const what = `${t.date} ${t.note || cleanMerchant(t.description)} ${money(t.amount_cents)}`;
  if (a.unsplit_to_category !== undefined) {
    const r = pick("category", a.unsplit_to_category, cats);
    if ("problem" in r) return no(r.problem!);
    return draft({ kind: "unsplit_tx", id: t.id, categoryId: r.id }, [`Remove the split on ${what}: all of it → ${r.name}`]);
  }
  const lines: { categoryId: string; cents: number; name: string }[] = [];
  for (const l of a.lines ?? []) {
    const r = pick("category", l.category, cats);
    if ("problem" in r) return no(r.problem!);
    lines.push({ categoryId: r.id, cents: cents(l.amount), name: r.name });
  }
  const sum = lines.reduce((s, l) => s + l.cents, 0);
  if (lines.length < 2) return no("A split needs at least two lines.");
  if (sum !== Math.abs(t.amount_cents)) return no(`Lines add up to ${money(sum)}, not ${money(Math.abs(t.amount_cents))}.`);
  return draft({ kind: "split_tx", id: t.id, lines: lines.map(({ categoryId, cents: c }) => ({ categoryId, cents: c })) }, [
    `Split ${what}: ${lines.map((l) => `${l.name} ${money(l.cents)}`).join(" + ")}`,
  ]);
}

// ───────────────────────────── balances ─────────────────────────────

export async function draftSetBalance(a: { account: string; amount: number }): Promise<DraftResult> {
  const accounts = await listAccountsForChanges();
  const r = resolveAccount(a.account, accounts);
  if (!r.ok) return no(`Which account? ${r.options.join(" / ")}`);
  const acct = accounts.find((x) => x.id === r.id)!;
  const c = cents(a.amount);
  const debt = acct.group.startsWith("debt_");
  return draft({ kind: "set_balance", accountId: acct.id, cents: c }, [
    `Set ${acct.name} to ${money(c)}${debt ? " owed" : ""} as of today (bank's figure). Entries already dated up to today won't change it again.`,
  ]);
}

// ───────────────────────────── money owed to the owner ─────────────────────────────

export async function draftOwed(a: { action: "add" | "received" | "undo_received" | "remove"; person: string; amount?: number; note?: string; transaction_id?: string }): Promise<DraftResult> {
  if (a.action === "add") {
    if (!a.amount) return no("How much do they owe?");
    const c = cents(a.amount);
    let on = "";
    if (a.transaction_id) {
      const t = await getTransactionBrief(a.transaction_id);
      if (!t) return no("Transaction not found.");
      on = ` for ${t.date} ${t.note || cleanMerchant(t.description)} (that part leaves the owner's spending)`;
    }
    return draft({ kind: "owed_add", person: a.person.trim(), cents: c, note: a.note?.trim() || null, transactionId: a.transaction_id ?? null }, [`${a.person.trim()} owes ${money(c)}${on}${a.note ? ` · "${a.note}"` : ""}`]);
  }
  const owed = await listOwed();
  const pool = a.action === "undo_received" ? owed.settled : owed.open;
  const matches = pool.filter((o) => o.person.toLowerCase() === a.person.trim().toLowerCase() && (a.amount === undefined || o.amount_cents === Math.round(a.amount * 100)));
  if (matches.length !== 1)
    return no(matches.length ? `Several entries for ${a.person}: give the amount.` : `No ${a.action === "undo_received" ? "received" : "open"} entry for ${a.person}. Open: ${owed.open.map((o) => `${o.person} ${money(o.amount_cents)}`).join(", ") || "none"}`);
  const o = matches[0];
  const kind = a.action === "received" ? "owed_received" : a.action === "undo_received" ? "owed_undo" : "owed_remove";
  const verb = a.action === "received" ? "Mark as received" : a.action === "undo_received" ? "Undo received (owed again)" : "Remove";
  return draft({ kind, id: o.id }, [`${verb}: ${o.person} ${money(o.amount_cents)}`]);
}

// ───────────────────────────── bills ─────────────────────────────

export async function draftBill(a: {
  action: "add" | "update" | "stop" | "resume" | "delete";
  name: string;
  new_name?: string;
  amount?: number;
  account?: string;
  category?: string;
  how_often?: "monthly" | "once";
  next_date?: string;
  end_date?: string | null;
}): Promise<DraftResult> {
  const [b, opts] = await Promise.all([getBills(), getEditOptions()]);
  const existing = a.action === "add" ? null : pick("bill", a.name, b.bills);
  if (existing && "problem" in existing) return no(existing.problem!);
  const bill = existing ? b.bills.find((x) => x.id === existing.id)! : null;
  if (a.action === "stop" || a.action === "resume") return draft({ kind: "bill_active", id: bill!.id, active: a.action === "resume" }, [`${a.action === "stop" ? "Stop" : "Resume"} bill ${bill!.name}`]);
  if (a.action === "delete") return draft({ kind: "bill_delete", id: bill!.id }, [`Delete bill ${bill!.name} (${money(bill!.amount_cents)})`]);
  let accountId = bill?.accountId ?? null;
  if (a.account) {
    const r = resolveAccount(a.account, opts.accounts);
    if (!r.ok) return no(`Which account? ${r.options.join(" / ")}`);
    accountId = r.id;
  }
  let categoryId = bill?.categoryId ?? null;
  if (a.category) {
    const r = pick("category", a.category, opts.categories.map((c) => ({ id: c.id, name: c.name, parent: c.parent })));
    if ("problem" in r) return no(r.problem!);
    categoryId = r.id;
  }
  const amountCents = a.amount !== undefined ? cents(a.amount) : bill ? -bill.amount_cents : 0;
  if (!amountCents) return no("How much is the bill?");
  const nextDate = a.next_date ?? bill?.next ?? bill?.startDate;
  if (!nextDate) return no("When is it next due (YYYY-MM-DD)?");
  const cadence = a.how_often ?? bill?.cadence ?? "monthly";
  const name = (a.new_name ?? a.name).trim();
  return draft(
    {
      kind: "bill_save",
      bill: { id: bill?.id, name, note: bill?.note ?? null, amountCents, accountId, categoryId, cadence, nextDate, endDate: a.end_date === undefined ? (bill?.endDate ?? null) : a.end_date, merchantKey: bill?.merchantKey ?? null },
    },
    [`${bill ? "Update" : "Add"} bill ${name}: ${money(-amountCents)} ${cadence}, next ${nextDate}${accountId ? ` · ${opts.accounts.find((x) => x.id === accountId)?.name ?? ""}` : ""}`],
  );
}

// ───────────────────────────── budget, rules ─────────────────────────────

export async function draftBudget(a: { total?: number; lines?: { line: string; amount: number }[] }): Promise<DraftResult> {
  const b = await getBudgets();
  const preview: string[] = [];
  const lines: { id: string; cents: number }[] = [];
  for (const l of a.lines ?? []) {
    const r = pick("budget line", l.line, b.status.lines);
    if ("problem" in r) return no(r.problem!);
    const cur = b.status.lines.find((x) => x.id === r.id)!;
    lines.push({ id: r.id, cents: cents(l.amount) });
    preview.push(`${cur.name}: ${money(cur.budget)} → ${money(cents(l.amount))} a month`);
  }
  const total = a.total !== undefined ? cents(a.total) : null;
  if (total !== null) preview.unshift(`Monthly total: ${money(b.total ?? b.status.budget)} → ${money(total)}`);
  if (!preview.length) return no("Nothing to change.");
  return draft({ kind: "budget", month: b.month, totalCents: total, lines }, preview);
}

export async function draftRule(a: { action: "add" | "delete"; merchant: string; category?: string; apply_to_past?: boolean }): Promise<DraftResult> {
  const data = await listRulesAndCategories();
  if (a.action === "delete") {
    const r = data.rules.find((x) => x.merchant.toLowerCase() === a.merchant.trim().toLowerCase());
    if (!r) return no(`No rule for "${a.merchant}". Rules: ${data.rules.map((x) => x.merchant).join(", ") || "none"}`);
    return draft({ kind: "rule_delete", id: r.id }, [`Delete rule: ${r.merchant} → ${r.category}`]);
  }
  if (!a.category) return no("Which category should it go to?");
  const opts = await getEditOptions();
  const r = pick("category", a.category, opts.categories.map((c) => ({ id: c.id, name: c.name, parent: c.parent })));
  if ("problem" in r) return no(r.problem!);
  return draft({ kind: "rule_add", description: a.merchant, categoryId: r.id, applyToPast: !!a.apply_to_past }, [
    `Always put ${cleanMerchant(a.merchant)} in ${r.name}${a.apply_to_past ? " (and re-categorize past ones)" : ""}`,
  ]);
}

// ───────────────────────────── goals, investments ─────────────────────────────

export async function draftGoal(a: { action: "add" | "update" | "delete"; name: string; new_name?: string; target?: number; monthly?: number }): Promise<DraftResult> {
  const g = await getGoals();
  const cur = a.action === "add" ? null : pick("goal", a.name, g.goals);
  if (cur && "problem" in cur) return no(cur.problem!);
  const goal = cur ? g.goals.find((x) => x.id === cur.id)! : null;
  if (a.action === "delete") return draft({ kind: "goal_delete", id: goal!.id }, [`Delete goal ${goal!.name}`]);
  const targetCents = a.target !== undefined ? cents(a.target) : (goal?.target ?? 0);
  if (!targetCents) return no("What's the target amount?");
  const monthlyCents = a.monthly !== undefined ? cents(a.monthly) : (goal?.monthly ?? 0);
  const name = (a.new_name ?? a.name).trim();
  return draft({ kind: "goal_save", goal: { id: goal?.id, name, targetCents, monthlyCents, accountId: goal?.accountId ?? g.accounts[0]?.id ?? null } }, [
    `${goal ? "Update" : "Create"} goal ${name}: target ${money(targetCents)}, ${money(monthlyCents)}/month`,
  ]);
}

export async function draftInvestment(a: { action: "add" | "update_value" | "remove"; name: string; value?: number; institution?: string }): Promise<DraftResult> {
  if (a.action === "add") {
    if (a.value === undefined) return no("What's it worth now?");
    return draft({ kind: "inv_add", name: a.name.trim(), institution: a.institution?.trim() || null, cents: cents(a.value) }, [`Add investment account ${a.name.trim()} worth ${money(cents(a.value))}`]);
  }
  const inv = await getInvestments();
  const r = pick("investment account", a.name, inv);
  if ("problem" in r) return no(r.problem!);
  const cur = inv.find((x) => x.id === r.id)!;
  if (a.action === "remove") return draft({ kind: "inv_remove", accountId: cur.id }, [`Remove ${cur.name} (history kept)`]);
  if (a.value === undefined) return no("What's the new value?");
  return draft({ kind: "inv_value", accountId: cur.id, cents: cents(a.value) }, [`${cur.name}: ${money(cur.value)} → ${money(cents(a.value))}`]);
}

// ───────────────────────────── apply (after the owner's yes) ─────────────────────────────

export async function applyChange(raw: unknown): Promise<string> {
  const c = raw as Change;
  switch (c.kind) {
    case "edit_tx":
      await updateTransaction(c.id, c.patch);
      return "Transaction updated";
    case "delete_tx": {
      // Deleting one transfer leg removes its pair too: skip ids already gone.
      const gone = new Set<string>();
      for (const id of c.ids) if (!gone.has(id)) for (const d of await deleteTransaction(id)) gone.add(d);
      return `Deleted ${gone.size} transaction${gone.size === 1 ? "" : "s"}`;
    }
    case "split_tx":
      await saveSplits(c.id, c.lines);
      return "Split saved";
    case "unsplit_tx":
      await removeSplits(c.id, c.categoryId);
      return "Split removed";
    case "set_balance":
      await reconcileAccount(c.accountId, c.cents);
      return "Balance updated";
    case "owed_add":
      await addOwed({ person: c.person, amountCents: c.cents, note: c.note ?? undefined, transactionId: c.transactionId ?? undefined });
      return "Added to Owed to you";
    case "owed_received":
      await settleOwed(c.id);
      return "Marked as received";
    case "owed_undo":
      await unsettleOwed(c.id);
      return "Owed again";
    case "owed_remove":
      await deleteOwed(c.id);
      return "Removed";
    case "bill_save":
      await saveBill(c.bill);
      return "Bill saved";
    case "bill_active":
      await setBillActive(c.id, c.active);
      return c.active ? "Bill resumed" : "Bill stopped";
    case "bill_delete":
      await deleteBill(c.id);
      return "Bill deleted";
    case "budget":
      if (c.totalCents !== null) await setMonthlyBudget(c.totalCents);
      if (c.lines.length) await setBudgetLines(c.month, "default", c.lines);
      return "Budget updated";
    case "rule_add": {
      const n = await createMerchantRule(c.description, c.categoryId, c.applyToPast);
      return `Rule added${n ? ` · ${n} past transaction${n === 1 ? "" : "s"} re-categorized` : ""}`;
    }
    case "rule_delete":
      await deleteRule(c.id);
      return "Rule deleted";
    case "goal_save":
      await saveGoal(c.goal);
      return "Goal saved";
    case "goal_delete":
      await deleteGoal(c.id);
      return "Goal deleted";
    case "inv_add":
      await addInvestmentAccount({ name: c.name, institution: c.institution ?? undefined, valueCents: c.cents });
      return "Investment account added";
    case "inv_value":
      await reconcileAccount(c.accountId, c.cents);
      return "Value updated";
    case "inv_remove":
      await archiveInvestmentAccount(c.accountId);
      return "Investment account removed";
    default:
      throw new Error("Unknown change.");
  }
}
