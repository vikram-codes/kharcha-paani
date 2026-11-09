"use server";

import { revalidatePath } from "next/cache";
import {
  deleteBill,
  deleteGoal,
  dismiss,
  getBills,
  getEditOptions,
  getGoals,
  moveToSavings,
  saveBill,
  saveGoal,
  setBillActive,
  type BillInput,
} from "@/lib/data";

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

export async function loadBills() {
  const [bills, options] = await Promise.all([getBills(), getEditOptions()]);
  return { ...bills, options };
}
export const saveBillAction = async (b: BillInput) => run(() => saveBill(b));
export const setBillActiveAction = async (id: string, active: boolean) => run(() => setBillActive(id, active));
export const deleteBillAction = async (id: string) => run(() => deleteBill(id));
export const dismissAction = async (key: string) => run(() => dismiss(key));
export const moveToSavingsAction = async (amountCents: number, key?: string) => run(() => moveToSavings(amountCents, key));

export async function loadGoals() {
  return getGoals();
}
export const saveGoalAction = async (g: { id?: string; name: string; targetCents: number; monthlyCents: number; accountId: string | null }) => run(() => saveGoal(g));
export const deleteGoalAction = async (id: string) => run(() => deleteGoal(id));
