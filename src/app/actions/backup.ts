"use server";

import { ownerBackup } from "@/lib/data";

type Fail = { ok: false; error: string };
const fail = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : "Backup failed." });

/** The backup zip, after the PIN checks out. */
export async function downloadBackup(pin: string): Promise<{ ok: true; fileName: string; zip: Uint8Array } | Fail> {
  try {
    const r = await ownerBackup(String(pin ?? ""), "download");
    if (!r.ok) return { ok: false, error: r.error };
    return r.zip ? { ok: true, fileName: r.fileName, zip: r.zip } : { ok: false, error: "Backup failed." };
  } catch (e) {
    return fail(e);
  }
}

/** Emails the backup now (also tests that the weekly email works). */
export async function emailBackupNow(pin: string): Promise<{ ok: true; emailedTo: string } | Fail> {
  try {
    const r = await ownerBackup(String(pin ?? ""), "email");
    if (!r.ok) return { ok: false, error: r.error };
    return r.emailedTo ? { ok: true, emailedTo: r.emailedTo } : { ok: false, error: "Backup failed." };
  } catch (e) {
    return fail(e);
  }
}
