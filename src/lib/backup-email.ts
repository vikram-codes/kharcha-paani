import "server-only";
import { formatDay, type ISODate } from "@/lib/dates";

/**
 * Sends the backup zip by email through Resend (owner, Nov 11 2026).
 * Needs RESEND_API_KEY. Without a verified domain, Resend's test sender
 * (onboarding@resend.dev) can only send to the address the Resend account
 * was opened with, which is fine here: it only ever goes to the owner.
 * BACKUP_EMAIL_FROM overrides the sender once a domain is set up.
 */
export const backupEmailConfigured = () => !!process.env.RESEND_API_KEY;

export async function emailBackup(to: string, today: ISODate, file: { fileName: string; zip: Uint8Array; counts: Record<string, number> }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Weekly backup email isn't set up: RESEND_API_KEY is missing.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.BACKUP_EMAIL_FROM || "Kharcha-Paani <onboarding@resend.dev>",
      to: [to],
      subject: `Kharcha-Paani backup · ${formatDay(today)}`,
      text: [
        "Your weekly Kharcha-Paani backup is attached.",
        "",
        `${file.counts.transactions} transactions, ${file.counts.accounts} accounts.`,
        "Open transactions.csv in Numbers or Google Sheets; backup.json has everything needed to rebuild the app.",
        "",
        "Keep these emails: each one is a full copy as of its date.",
      ].join("\n"),
      attachments: [{ filename: file.fileName, content: Buffer.from(file.zip).toString("base64") }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend refused the email (${res.status}): ${body.slice(0, 200)}`);
  }
}
