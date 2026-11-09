import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  draftBill,
  draftBudget,
  draftDeleteTransactions,
  draftEditTransaction,
  draftGoal,
  draftInvestment,
  draftOwed,
  draftRule,
  draftSetBalance,
  draftSplitTransaction,
  type DraftResult,
} from "./changes";

/**
 * Edit / delete / manage tools (full access, owner's request Nov 9 2026). Every
 * one is a draft: it returns a before → after preview and saves nothing until
 * confirm_draft is called after the owner's explicit yes.
 */
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const out = (r: DraftResult) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(
        r.ok
          ? { saved: false, draft_id: r.draftId, preview: r.preview, next: "Show this to the owner. Call confirm_draft only if they say yes." }
          : { saved: false, problems: r.problems, next: "Ask the owner to clarify, then draft again." },
        null,
        1,
      ),
    },
  ],
});
const guard = async (fn: () => Promise<DraftResult>) => {
  try {
    return out(await fn());
  } catch (e) {
    return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
  }
};
const tail = " SAVES NOTHING: returns a preview; call confirm_draft only after the owner says yes.";

export function registerChangeTools(server: McpServer) {
  server.registerTool(
    "draft_edit_transaction",
    {
      title: "Edit a transaction (draft)",
      description: "Change a transaction's amount, type, category, account (e.g. move a payment to another card), date or note. Get the id from list_transactions." + tail,
      inputSchema: z.object({
        id: z.string().uuid(),
        amount: z.number().positive().optional().describe("Dollars"),
        type: z.enum(["expense", "income"]).optional(),
        category: z.string().optional(),
        account: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        note: z.string().nullable().optional(),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftEditTransaction(a)),
  );

  server.registerTool(
    "draft_delete_transactions",
    {
      title: "Delete transactions (draft)",
      description: "Delete one or more transactions by id (e.g. duplicates). For a transfer, delete both sides." + tail,
      inputSchema: z.object({ ids: z.array(z.string().uuid()).min(1).max(25) }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ ids }) => guard(() => draftDeleteTransactions(ids)),
  );

  server.registerTool(
    "draft_split_transaction",
    {
      title: "Split / unsplit a transaction (draft)",
      description: "Split one transaction across categories (lines must add up to its amount), or remove a split with unsplit_to_category." + tail,
      inputSchema: z.object({
        id: z.string().uuid(),
        lines: z.array(z.object({ category: z.string(), amount: z.number().positive() })).optional(),
        unsplit_to_category: z.string().optional(),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftSplitTransaction(a)),
  );

  server.registerTool(
    "draft_set_balance",
    {
      title: "Set an account balance (draft)",
      description: "Record what the bank shows today for a card, bank account, Affirm plan or investment (for debts: the amount owed). Not for the emergency fund." + tail,
      inputSchema: z.object({ account: z.string(), amount: z.number().min(0).describe("Dollars") }),
      annotations: WRITE,
    },
    (a) => guard(() => draftSetBalance(a)),
  );

  server.registerTool(
    "draft_owed",
    {
      title: "Money owed to the owner (draft)",
      description: 'Add someone who owes the owner money (optionally tied to a transaction id: that part leaves spending), mark it "received", undo a received, or remove it.' + tail,
      inputSchema: z.object({
        action: z.enum(["add", "received", "undo_received", "remove"]),
        person: z.string(),
        amount: z.number().positive().optional(),
        note: z.string().optional(),
        transaction_id: z.string().uuid().optional(),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftOwed(a)),
  );

  server.registerTool(
    "draft_bill",
    {
      title: "Manage a bill (draft)",
      description: "Add, update, stop, resume or delete an upcoming bill (identified by name)." + tail,
      inputSchema: z.object({
        action: z.enum(["add", "update", "stop", "resume", "delete"]),
        name: z.string(),
        new_name: z.string().optional(),
        amount: z.number().positive().optional(),
        account: z.string().optional(),
        category: z.string().optional(),
        how_often: z.enum(["monthly", "once"]).optional(),
        next_date: z.string().optional().describe("YYYY-MM-DD"),
        end_date: z.string().nullable().optional().describe("Last payment date for monthly bills"),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftBill(a)),
  );

  server.registerTool(
    "draft_budget",
    {
      title: "Change the budget (draft)",
      description: "Change the monthly total and/or budget lines (by line name, e.g. Groceries, Fun). Amounts are per month." + tail,
      inputSchema: z.object({
        total: z.number().positive().optional(),
        lines: z.array(z.object({ line: z.string(), amount: z.number().min(0) })).optional(),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftBudget(a)),
  );

  server.registerTool(
    "draft_rule",
    {
      title: "Category rule (draft)",
      description: 'Add "always put <merchant> in <category>" (optionally re-categorizing past ones), or delete a rule.' + tail,
      inputSchema: z.object({
        action: z.enum(["add", "delete"]),
        merchant: z.string().describe("Merchant as it appears, e.g. Freshco or a bank descriptor"),
        category: z.string().optional(),
        apply_to_past: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftRule(a)),
  );

  server.registerTool(
    "draft_goal",
    {
      title: "Savings goal (draft)",
      description: "Create, update or delete a savings goal (target and monthly amount)." + tail,
      inputSchema: z.object({
        action: z.enum(["add", "update", "delete"]),
        name: z.string(),
        new_name: z.string().optional(),
        target: z.number().positive().optional(),
        monthly: z.number().min(0).optional(),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftGoal(a)),
  );

  server.registerTool(
    "draft_investment",
    {
      title: "Investment account (draft)",
      description: "Add an investment account, update its value, or remove it (history kept)." + tail,
      inputSchema: z.object({
        action: z.enum(["add", "update_value", "remove"]),
        name: z.string(),
        value: z.number().min(0).optional(),
        institution: z.string().optional(),
      }),
      annotations: WRITE,
    },
    (a) => guard(() => draftInvestment(a)),
  );
}
