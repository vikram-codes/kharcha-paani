import "server-only";

/**
 * Sends the backup zip by email through Resend (owner, Nov 11 2026; monthly
 * from Nov 12). Needs RESEND_API_KEY. Without a verified domain, Resend's test
 * sender (onboarding@resend.dev) can only send to the address the Resend
 * account was opened with, which is fine here: it only ever goes to the owner.
 * BACKUP_EMAIL_FROM overrides the sender once a domain is set up.
 */
export const backupEmailConfigured = () => !!process.env.RESEND_API_KEY;

export type BackupMonth = {
  /** "October 2026", or "November so far" for one sent mid-month. */
  label: string;
  spent: number;
  budget: number;
  income: number;
  transactions: number;
};

const money = (cents: number) => `$${(Math.abs(cents) / 100).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const count = (n: number | undefined) => (n ?? 0).toLocaleString("en-CA");
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The email: the month at a glance, what's attached, and to keep it. Facts only. */
export function backupEmailContent(subjectWhen: string, file: { fileName: string; counts: Record<string, number> }, month: BackupMonth | null) {
  const subject = `Kharcha-Paani backup · ${subjectWhen}`;
  const glance = month
    ? [
        ["Spent", `${money(month.spent)}${month.budget > 0 ? ` of ${money(month.budget)}` : ""}`],
        ["Income", money(month.income)],
        ["Transactions", count(month.transactions)],
      ]
    : [];
  const text = [
    `Your Kharcha-Paani backup${month ? ` for ${month.label}` : ""} is attached.`,
    "",
    ...(month ? [`${month.label} at a glance:`, ...glance.map(([k, v]) => `  ${k}: ${v}`), ""] : []),
    `Attached: ${file.fileName}, a full copy of everything in the app (${count(file.counts.transactions)} transactions, ${count(file.counts.accounts)} accounts).`,
    "transactions.csv opens in Numbers or Google Sheets; backup.json has everything needed to rebuild the app.",
    "",
    "Keep this email: each one is a complete copy as of its date.",
  ].join("\n");

  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:#71717a;font-size:14px">${escape(k)}</td><td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600;color:#0a0a0a">${escape(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:24px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#71717a">Kharcha-Paani</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#0a0a0a">Backup${month ? ` · ${escape(month.label)}` : ""}</h1>
${
  month
    ? `<p style="margin:0 0 6px;font-size:13px;color:#71717a">${escape(month.label)} at a glance</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin-bottom:16px">${glance.map(([k, v]) => row(k, v)).join("")}</table>`
    : ""
}
<p style="margin:0 0 8px;font-size:14px;color:#0a0a0a">Attached: <strong>${escape(file.fileName)}</strong></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#52525b">A full copy of everything in the app: ${count(file.counts.transactions)} transactions and ${count(file.counts.accounts)} accounts. <em>transactions.csv</em> opens in Numbers or Google Sheets; <em>backup.json</em> has everything needed to rebuild the app.</p>
<p style="margin:0;font-size:12px;color:#a1a1aa">Keep this email: each one is a complete copy as of its date. Not included: your PIN and connector links.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function emailBackup(to: string, subjectWhen: string, file: { fileName: string; zip: Uint8Array; counts: Record<string, number> }, month: BackupMonth | null) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Backup email isn't set up: RESEND_API_KEY is missing.");
  const { subject, text, html } = backupEmailContent(subjectWhen, file, month);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.BACKUP_EMAIL_FROM || "Kharcha-Paani <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
      html,
      attachments: [{ filename: file.fileName, content: Buffer.from(file.zip).toString("base64") }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend refused the email (${res.status}): ${body.slice(0, 200)}`);
  }
}
