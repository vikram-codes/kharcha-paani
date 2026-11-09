"use server";

import { revalidatePath } from "next/cache";
import {
  addCategory,
  createMerchantRule,
  deleteRule,
  listRulesAndCategories,
  removeSplits,
  renameCategory,
  saveSplits,
  setCategoryArchived,
} from "@/lib/data";

type Result = { ok: true; count?: number } | { ok: false; error: string };
async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    const r = await fn();
    revalidatePath("/", "layout");
    return { ok: true, count: typeof r === "number" ? r : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export const makeRuleAction = async (description: string, categoryId: string, applyToPast: boolean) => run(() => createMerchantRule(description, categoryId, applyToPast));
export const deleteRuleAction = async (id: string) => run(() => deleteRule(id));
export const loadCategories = async () => listRulesAndCategories();
export const renameCategoryAction = async (id: string, name: string) => run(() => renameCategory(id, name));
export const archiveCategoryAction = async (id: string, archived: boolean) => run(() => setCategoryArchived(id, archived));
export const addCategoryAction = async (parentId: string, name: string, essential: "fixed" | "variable" | null) => run(() => addCategory(parentId, name, essential));
export const saveSplitsAction = async (txId: string, lines: { categoryId: string; cents: number }[]) => run(() => saveSplits(txId, lines));
export const removeSplitsAction = async (txId: string, categoryId: string | null) => run(() => removeSplits(txId, categoryId));
