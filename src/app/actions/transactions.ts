"use server";

import { revalidatePath } from "next/cache";
import { createManualTransaction, getQuickAddOptions, type NewTransaction } from "@/lib/data";

export async function loadQuickAdd() {
  return getQuickAddOptions();
}

export async function addTransaction(input: NewTransaction): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const saved = await createManualTransaction(input);
    // Every screen's totals change: refresh them (incl. the privately cached summaries).
    revalidatePath("/", "layout");
    return { ok: true, message: `${saved.category} · ${saved.account}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save. Try again." };
  }
}
