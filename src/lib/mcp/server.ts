import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  activityData,
  confirmDraft,
  discardDraft,
  draftTransactions,
  draftTransfer,
  getBills,
  getCash,
  getDebts,
  getEditOptions,
  getHome,
  getStudentLoan,
  getBudgets,
  historySummaryData,
  listOwed,
  monthSummaryData,
} from "@/lib/data";
import { isMonthKey } from "@/lib/dates";
import { cleanMerchant } from "@/lib/merchant";
import { HISTORY } from "@/lib/periods";
import { registerChangeTools } from "./change-tools";

/**
 * Kharcha-Paani tools for Claude (§7.11). Reads go through the same data layer
 * as the app. Writes are two-step: draft_transactions shows exactly what would
 * be saved; confirm_draft saves it, only after the owner says yes.
 */
export const INSTRUCTIONS = `Kharcha-Paani is the owner's personal finance app (Canadian dollars, Toronto time).
Money model: Cash = bank accounts (the emergency fund is private and never shown here). Debts = credit cards + Affirm; the student loan (India, 9.5%) is separate. Card purchases count as spending when made and raise that card's debt; card payments are transfers, not spending.
Budget: a monthly headline budget plus fixed and variable lines. "Spent" excludes transfers, friend paybacks and balance adjustments.
Writing (full access: add, edit, move, delete, split, balances, owed money, bills, budget, rules, goals, investments): NEVER save without the owner's explicit yes. Always call the matching draft_* tool first (draft_transactions for new purchases/income, draft_transfer for card payments, draft_edit_transaction / draft_delete_transactions with ids from list_transactions, etc.), show the preview lines to the owner, and call confirm_draft only after they clearly agree in this conversation. If the draft reports problems (unclear category/account), ask the owner instead of guessing.
Amounts in tool results are dollars. Expenses are negative in transaction lists.`;

const $ = (c: number) => Math.round(c) / 100;
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 1) }] });
const fail = (e: unknown) => ({ ...text(`Error: ${e instanceof Error ? e.message : String(e)}`), isError: true });
const READ = { readOnlyHint: true, openWorldHint: false } as const;
const monthArg = z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Month as YYYY-MM. Defaults to the current month.");

export function registerTools(server: McpServer) {
  registerChangeTools(server);

  server.registerTool(
    "get_overview",
    {
      title: "Overview",
      description: "Today's snapshot: cash, debts, investments, this month's spending vs budget, next payday, upcoming bills, money owed to the owner.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      try {
        const h = await getHome();
        return text({
          today: h.today,
          cash_excluding_emergency_fund: $(h.cash),
          debts: $(h.debts),
          investments: $(h.investments),
          this_month: { month: h.month, spent: $(h.spent), budget: $(h.budget), left: $(h.budget - h.spent), days_left: h.daysLeft },
          next_payday: h.nextPayday,
          owed_to_owner: $(h.owedToMe),
          upcoming_bills: h.upcoming.map((u) => ({ name: u.name, date: u.date, amount: $(u.amount_cents), note: u.note })),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_month_summary",
    {
      title: "Month summary",
      description: `Income, spending and net for a month, spending by category, budget status per line, adjustments. Use "${HISTORY.key}" for the combined Dec 2024 – Dec 2025 history.`,
      inputSchema: z.object({ month: z.string().optional().describe(`YYYY-MM (default: this month) or "${HISTORY.key}"`) }),
      annotations: READ,
    },
    async ({ month }) => {
      try {
        if (month === HISTORY.key) {
          const h = await historySummaryData();
          const s = h.summary;
          return text({
            period: "Dec 2024 – Dec 2025",
            income: $(s.income),
            spent: $(s.spent),
            net: $(s.net),
            avg_spent_per_month: $(h.avgSpent),
            categories: s.expenses.map((e) => ({ category: e.category?.name ?? "Uncategorized", spent: $(e.cents) })),
            income_sources: s.incomes.map((e) => ({ source: e.category?.name ?? "Uncategorized", amount: $(e.cents) })),
          });
        }
        const m = month && isMonthKey(month) ? month : (await getHome()).month;
        const d = await monthSummaryData(m);
        const s = d.summary;
        return text({
          month: m,
          so_far: d.isCurrent,
          income: $(s.income),
          spent: $(s.spent),
          net: $(s.net),
          previous_month: d.previous ? { income: $(d.previous.income), spent: $(d.previous.spent) } : null,
          budget: { total: $(d.budget.total), spent: $(d.budget.spent), unplanned: $(d.budget.unbudgeted) },
          budget_lines: d.budget.lines.map((l) => ({ line: l.name, kind: l.kind, budget: $(l.budget), spent: $(l.spent), pct: l.pct })),
          categories: s.expenses.map((e) => ({ category: e.category?.name ?? "Uncategorized", group: e.category?.parentName, spent: $(e.cents), transactions: e.count })),
          income_sources: s.incomes.map((e) => ({ source: e.category?.name ?? "Uncategorized", amount: $(e.cents) })),
          adjustments: $(s.adjustments),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List transactions",
      description: "Transactions paid in a month (newest first), optionally filtered by text (merchant, note, category or account). Transfers are included and marked.",
      inputSchema: z.object({
        month: monthArg,
        search: z.string().optional().describe("Case-insensitive text to match"),
        limit: z.number().int().min(1).max(200).optional().describe("Default 60"),
      }),
      annotations: READ,
    },
    async ({ month, search, limit }) => {
      try {
        const a = await activityData(month && isMonthKey(month) ? month : undefined);
        const q = search?.trim().toLowerCase();
        const rows = a.rows
          .map((r) => ({
            id: r.id,
            date: r.date,
            merchant: r.note && r.source === "manual" ? r.note : cleanMerchant(r.description),
            amount: $(r.amount_cents),
            category: r.splits.length ? `Split: ${r.splits.map((s) => `${s.name} ${$(s.amount_cents)}`).join(" + ")}` : (r.category?.name ?? "Uncategorized"),
            account: r.account,
            transfer: r.isTransfer || undefined,
            note: r.note ?? undefined,
            friend_owes: r.owed.length ? r.owed.map((o) => `${o.person} ${$(o.amount_cents)}${o.settled ? " (received)" : ""}`).join(", ") : undefined,
          }))
          .filter((r) => !q || [r.merchant, r.category, r.account, r.note ?? ""].some((s) => s.toLowerCase().includes(q)));
        return text({ month: a.month, count: rows.length, transactions: rows.slice(0, limit ?? 60) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_budget",
    {
      title: "Budget status",
      description: "This month's budget: headline total, spent, and every budget line (fixed and variable) with its categories' spending.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      try {
        const b = await getBudgets();
        const s = b.status;
        return text({
          month: b.month,
          days_left: b.daysLeft,
          total_budget: $(b.total ?? s.budget),
          spent: $(s.spent),
          lines: s.lines.map((l) => ({ line: l.name, kind: l.kind, budget: $(l.budget), spent: $(l.spent), left: $(l.budget - l.spent), paid: l.paid || undefined })),
          unplanned_spending: $(s.unbudgeted),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_debts",
    {
      title: "Debts",
      description: "Credit cards and Affirm plans with balances owed, limits, APRs and any purchases still to be entered; plus the student loan (balance, monthly interest, EMI, payoff estimate).",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      try {
        const [d, loan] = await Promise.all([getDebts(), getStudentLoan()]);
        return text({
          total_cards_and_affirm: $(d.total),
          cards: d.cards.map((c) => ({
            name: c.name,
            owed: $(c.owed),
            limit: c.limit != null ? $(c.limit) : undefined,
            apr: c.apr ?? undefined,
          })),
          affirm: d.plans.map((p) => ({ name: p.name, owed: $(p.owed) })),
          student_loan: loan && {
            owed: $(loan.owed),
            paid_so_far: $(loan.paid),
            apr: loan.apr,
            next_interest: $(loan.nextInterest),
            monthly_emi: $(loan.monthlyPayment),
            goes_to_principal: $(loan.toPrincipal),
            payoff_month: loan.payoff,
            in_rupees: loan.interest && {
              borrowed: loan.interest.borrowedInr,
              repaid: loan.interest.repaidInr,
              owed_now: loan.interest.owedInr,
              interest_charged_to_date: loan.interest.chargedInr,
              interest_per_month_now: loan.interest.perMonthInr,
            },
          },
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_bills_and_owed",
    {
      title: "Bills and money owed",
      description: "Upcoming bills (next date, amount, account) and money friends owe the owner.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      try {
        const [b, o, c] = await Promise.all([getBills(), listOwed(), getCash()]);
        return text({
          bills: b.bills.filter((x) => x.active && x.next).map((x) => ({ name: x.name, next: x.next, amount: $(x.amount_cents), how_often: x.cadence, account: x.account })),
          owed_to_owner: o.open.map((x) => ({ person: x.person, amount: $(x.amount_cents), for: x.note ?? x.transaction?.description })),
          bank_accounts: c.bank.map((x) => ({ name: x.name, balance: $(x.cents) })),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_categories_and_accounts",
    {
      title: "Categories and accounts",
      description: "The names to use when drafting transactions: spending and income categories (by group) and the accounts purchases can be paid from.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => {
      try {
        const o = await getEditOptions();
        return text({
          accounts: o.accounts.map((a) => a.name),
          spending_categories: o.categories.filter((c) => c.kind === "expense").map((c) => `${c.parent} · ${c.name}`),
          income_categories: o.categories.filter((c) => c.kind === "income").map((c) => `${c.parent} · ${c.name}`),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "draft_transactions",
    {
      title: "Draft transactions (doesn't save)",
      description:
        "Prepare one or more transactions to add. SAVES NOTHING: returns a draft_id and preview lines. Show the preview to the owner and only call confirm_draft after they say yes. If problems come back (unclear category/account), ask the owner. Account defaults to the last one the owner used.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              type: z.enum(["expense", "income"]).default("expense"),
              amount: z.number().positive().describe("Dollars, e.g. 42.50"),
              category: z.string().optional().describe('e.g. "Groceries", "Eating out". Omit when using split.'),
              account: z.string().optional().describe('e.g. "Triangle", "CIBC", "Visa", "Chequing"'),
              date: z.string().optional().describe("YYYY-MM-DD, default today"),
              note: z.string().optional().describe("Merchant or short note, e.g. Costco"),
              split: z.array(z.object({ category: z.string(), amount: z.number().positive() })).optional().describe("Split across categories; must add up to amount"),
              friend_owes: z.object({ person: z.string(), amount: z.number().positive() }).optional().describe("Part a friend owes back (leaves the owner's spending)"),
            }),
          )
          .min(1)
          .max(25),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ items }) => {
      try {
        const r = await draftTransactions(items);
        if (!r.ok) return text({ saved: false, problems: r.problems, next: "Ask the owner to clarify, then draft again." });
        return text({ saved: false, draft_id: r.draftId, preview: r.preview, next: "Show this to the owner. Call confirm_draft only if they say yes." });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "draft_transfer",
    {
      title: "Draft a card payment or transfer (doesn't save)",
      description:
        "Prepare paying a credit card from a bank account (or moving money between chequing and savings). Not spending. SAVES NOTHING: show the preview to the owner and call confirm_draft only after they say yes.",
      inputSchema: z.object({
        to: z.string().describe('Card or account receiving the money, e.g. "Triangle", "CIBC", "Visa", "Savings"'),
        from: z.string().optional().describe('Bank account it comes from; default "Chequing"'),
        amount: z.number().positive().describe("Dollars"),
        date: z.string().optional().describe("YYYY-MM-DD, default today"),
        note: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        const r = await draftTransfer(args);
        if (!r.ok) return text({ saved: false, problems: r.problems, next: "Ask the owner to clarify, then draft again." });
        return text({ saved: false, draft_id: r.draftId, preview: r.preview, next: "Show this to the owner. Call confirm_draft only if they say yes." });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "confirm_draft",
    {
      title: "Confirm draft (saves)",
      description: "Saves a draft from draft_transactions. Call ONLY after the owner explicitly approved that exact preview in this conversation. Each draft can be saved once.",
      inputSchema: z.object({ draft_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ draft_id }) => {
      try {
        const saved = await confirmDraft(draft_id);
        return text({ saved: true, transactions: saved, note: "Saved in Kharcha-Paani (marked as added by Claude)." });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "discard_draft",
    {
      title: "Discard draft",
      description: "Throw away a draft the owner didn't want.",
      inputSchema: z.object({ draft_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ draft_id }) => {
      try {
        await discardDraft(draft_id);
        return text({ discarded: true });
      } catch (e) {
        return fail(e);
      }
    },
  );
}
