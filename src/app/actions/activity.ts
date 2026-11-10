"use server";

import { revalidatePath } from "next/cache";
import { FIRST_ACTIVITY_MONTH, SPLIT_NEEDS_UPDATE, activityData, deleteTransaction, getEditOptions, searchActivity, updateTransaction, type SplitLine, type TransactionPatch } from "@/lib/data";
import { isMonthKey } from "@/lib/dates";

export async function loadActivity(month: string) {
  if (!isMonthKey(month) || month < FIRST_ACTIVITY_MONTH) throw new Error("Unknown month");
  return activityData(month);
}

export async function loadEditOptions() {
  return getEditOptions();
}

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

/** `needsSplit`: the transaction is split and its amount changed, so new split lines are needed. */
export async function saveTransaction(id: string, patch: TransactionPatch, splits?: SplitLine[]): Promise<Result & { needsSplit?: boolean }> {
  try {
    await updateTransaction(id, patch, splits);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ...fail(e), needsSplit: e instanceof Error && e.message === SPLIT_NEEDS_UPDATE } as Result & { needsSplit?: boolean };
  }
}

/** Search every month (owner, Nov 10 2026). */
export async function searchTransactions(q: string) {
  return searchActivity(q);
}

export async function removeTransaction(id: string): Promise<Result> {
  try {
    await deleteTransaction(id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function loadAccount(id: string) {
  const { getAccountDetail } = await import("@/lib/data");
  return getAccountDetail(id);
}
