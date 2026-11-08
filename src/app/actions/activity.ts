"use server";

import { revalidatePath } from "next/cache";
import { FIRST_ACTIVITY_MONTH, activityData, deleteTransaction, getEditOptions, updateTransaction, type TransactionPatch } from "@/lib/data";
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

export async function saveTransaction(id: string, patch: TransactionPatch): Promise<Result> {
  try {
    await updateTransaction(id, patch);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
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
