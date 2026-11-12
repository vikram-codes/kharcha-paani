"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { commitStatementImport, getEditOptions, previewStatement, sendReminders, undoImport, type ImportCommit } from "@/lib/data";

const MAX_BYTES = 3 * 1024 * 1024;

export async function previewImport(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose a PDF statement." };
  if (file.size > MAX_BYTES) return { ok: false as const, error: "That file is over 3 MB." };
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return { ok: false as const, error: "Statements must be PDFs." };
  try {
    const [preview, options] = await Promise.all([previewStatement(new Uint8Array(await file.arrayBuffer()), file.name), getEditOptions()]);
    return { ok: true as const, preview, categories: options.categories };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't read that PDF." };
  }
}

export async function confirmImport(input: ImportCommit) {
  try {
    const res = await commitStatementImport(input);
    after(() => sendReminders("budget").then(() => undefined, (e) => console.error("[push] budget check", e)));
    revalidatePath("/", "layout");
    return { ok: true as const, ...res };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Import failed." };
  }
}

export async function undoImportAction(id: string) {
  try {
    await undoImport(id);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Undo failed." };
  }
}
