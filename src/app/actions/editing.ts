"use server";

import { revalidatePath } from "next/cache";
import { addOwed, deleteOwed, listOwed, reconcileAccount, setBudgetLines, setMonthlyBudget, settleOwed, unsettleOwed } from "@/lib/data";
import { isMonthKey } from "@/lib/dates";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Saves the budget: line amounts become the monthly amounts (and replace any one-off override for this month). */
export async function saveBudget(input: { month: string; totalCents: number | null; lines: { id: string; cents: number }[] }) {
  if (!isMonthKey(input.month)) return { ok: false as const, error: "Unknown month" };
  return run(async () => {
    if (input.totalCents != null) await setMonthlyBudget(input.totalCents);
    await setBudgetLines(input.month, "default", input.lines);
  });
}

export async function updateBalance(accountId: string, cents: number) {
  return run(() => reconcileAccount(accountId, cents));
}

export async function loadOwed() {
  return listOwed();
}

export async function addOwedAction(input: { person: string; amountCents: number; note?: string; transactionId?: string }) {
  return run(() => addOwed(input));
}

export async function settleOwedAction(id: string) {
  return run(() => settleOwed(id));
}

export async function deleteOwedAction(id: string) {
  return run(() => deleteOwed(id));
}

export async function unsettleOwedAction(id: string) {
  return run(() => unsettleOwed(id));
}
