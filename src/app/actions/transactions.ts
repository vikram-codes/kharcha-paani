"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createManualTransaction, createTransfer, getQuickAddOptions, sendReminders, type NewTransaction } from "@/lib/data";

/** After a save: tell the phone if this month just passed 80% or 100% of the budget. */
const checkBudget = () => after(() => sendReminders("budget").then(() => undefined, (e) => console.error("[push] budget check", e)));

export async function loadQuickAdd() {
  return getQuickAddOptions();
}

export async function addTransaction(input: NewTransaction): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const saved = await createManualTransaction(input);
    if (input.kind === "expense") checkBudget();
    // Every screen's totals change: refresh them (incl. the privately cached summaries).
    revalidatePath("/", "layout");
    return { ok: true, message: `${saved.category} · ${saved.account}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save. Try again." };
  }
}

export async function addTransfer(input: { fromId: string; toId: string; cents: number; date: string; note?: string; clientId?: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const t = await createTransfer(input);
    revalidatePath("/", "layout");
    return { ok: true, message: `${t.from} → ${t.to}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the transfer." };
  }
}
