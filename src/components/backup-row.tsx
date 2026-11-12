"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Archive, ChevronRight, Download, FileJson, FileSpreadsheet, Loader2, Lock, Mail, MailCheck, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { downloadBackup, emailBackupNow } from "@/app/actions/backup";
import { PinPad } from "@/components/pin-pad";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { addMonths, daysBetween, formatDay, formatShort, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type BackupStatus = { emailedAt: string | null; exportedAt: string | null; emailReady: boolean; emailConfigured: boolean };

/** The monthly email (1st of each month) is late after this many days. */
const LATE_DAYS = 35;

/** The 1st of next month: when the next automatic email goes out. */
const nextFirst = () => addMonths(`${todayISO().slice(0, 7)}-01`, 1);

/** What's in the zip, for the sheet. */
const CONTENTS = [
  { icon: FileSpreadsheet, label: "transactions.csv", hint: "Every transaction, for Numbers or Sheets" },
  { icon: FileSpreadsheet, label: "accounts.csv", hint: "Accounts and their balances" },
  { icon: FileJson, label: "backup.json", hint: "A full copy, enough to rebuild the app" },
];

const when = (ts: string) => {
  const day = todayISO(new Date(ts));
  const ago = daysBetween(day, todayISO());
  return ago === 0 ? "today" : ago === 1 ? "yesterday" : `${formatDay(day)} (${ago} days ago)`;
};

type Step = "menu" | "download" | "email";

/**
 * Backup (owner, Nov 11 2026): a row in Settings' list. It opens a sheet with
 * the status and two equal choices, download or email; both ask for the PIN,
 * since the backup includes the emergency fund.
 */
export function BackupRow({ status }: { status: BackupStatus }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [ready, setReady] = useState<{ fileName: string; zip: Uint8Array } | null>(null);
  // "Email it now": a sending card while it's built and sent, then a sent card.
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ to: string; fileName: string | null } | null>(null);
  const router = useRouter();
  const still = useReducedMotion();
  const [saving, startSaving] = useTransition();
  const late = status.emailReady && !!status.emailedAt && daysBetween(todayISO(new Date(status.emailedAt)), todayISO()) > LATE_DAYS;
  const next = nextFirst();

  const close = () => {
    setOpen(false);
    setStep("menu");
    setReady(null);
    setSending(false);
    if (sent) router.refresh(); // "Last emailed" → just now
    setSent(null);
  };

  // Saving needs a fresh tap (iOS only opens the share sheet from one), so it's its own button.
  const save = () =>
    ready &&
    startSaving(async () => {
      const file = new File([new Uint8Array(ready.zip)], ready.fileName, { type: "application/zip" });
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: ready.fileName });
        } else {
          const url = URL.createObjectURL(file);
          const a = Object.assign(document.createElement("a"), { href: url, download: ready.fileName });
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
        close();
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return; // closed the share sheet
        toast.error("Couldn't save the file.");
      }
    });

  const option = "flex w-full items-center gap-3 rounded-xl bg-surface-1 px-3 py-3 text-left ring-1 ring-border transition-colors duration-(--duration-fast) hover:bg-surface-2";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
          <Archive className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Backup</span>
          <span className={cn("block truncate text-xs", late ? "text-budget-high" : "text-muted-foreground")}>
            {late ? "Monthly email is late" : status.emailReady ? `Emailed on the 1st · next ${formatShort(next)}` : "Download or email everything"}
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <ResponsiveSheetContent>
          <div className="flex flex-col gap-4 px-5 pt-2 pb-6 md:pt-5">
            <div>
              <SheetTitle className="text-base font-semibold">
                {ready ? "Backup ready" : step === "menu" ? "Backup" : sending || sent ? "Email a backup" : "Enter your PIN"}
              </SheetTitle>
              <SheetDescription className={cn("text-xs", (sending || sent) && "sr-only")}>
                {ready
                  ? `${ready.fileName} · ${(ready.zip.byteLength / 1024).toFixed(0)} KB. Save it to Files or iCloud Drive.`
                  : step === "menu"
                    ? "A full copy of everything, in one zip. It's emailed to you on the 1st of every month."
                    : sent
                      ? "Your backup was sent."
                      : "The backup includes your emergency fund."}
              </SheetDescription>
            </div>

            {ready ? (
              <button type="button" onClick={save} disabled={saving} className={cn(option, "justify-center font-medium disabled:opacity-60")}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Save backup
              </button>
            ) : step === "menu" ? (
              <>
                <dl className="divide-y divide-border rounded-xl bg-surface-1 px-3 text-xs ring-1 ring-border">
                  {[
                    ["Monthly email", status.emailReady ? "On" : "Not set up yet"],
                    ["Last emailed", status.emailedAt ? when(status.emailedAt) : "Not yet"],
                    ...(status.emailReady ? [["Next email", formatDay(next)]] : []),
                    ["Last download", status.exportedAt ? when(status.exportedAt) : "Never"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                {late && status.emailedAt && (
                  <p className="flex items-start gap-2 rounded-xl bg-budget-high/10 px-3 py-2 text-xs text-budget-high">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    The monthly email hasn&apos;t gone out since {when(status.emailedAt)}. Check the cron job in Vercel.
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => setStep("download")} className={option}>
                    <Download className="size-4 text-muted-foreground" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">Download</span>
                      <span className="block text-xs text-muted-foreground">Save the zip to Files or iCloud Drive</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                  <button type="button" onClick={() => setStep("email")} disabled={!status.emailConfigured} className={cn(option, "disabled:opacity-50")}>
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">Email it now</span>
                      <span className="block text-xs text-muted-foreground">
                        {status.emailConfigured ? "Don't wait for the 1st: send a copy to your Gmail" : "Needs the Resend key in Vercel"}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </div>
                <div>
                  <p className="mb-1.5 px-1 text-xs text-muted-foreground">What&apos;s inside</p>
                  <ul className="divide-y divide-border rounded-xl bg-surface-1 px-3 ring-1 ring-border">
                    {CONTENTS.map(({ icon: Icon, label, hint }) => (
                      <li key={label} className="flex items-center gap-3 py-2.5">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="num block text-xs font-medium">{label}</span>
                          <span className="block text-[11px] text-muted-foreground">{hint}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                    <Lock className="size-3" /> Not included: your PIN and connector links.
                  </p>
                </div>
              </>
            ) : sent ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-3 pt-2 text-center"
                role="status"
              >
                <motion.span
                  initial={still ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                  className="grid size-20 place-items-center rounded-full bg-money-in/15"
                >
                  <MailCheck className="size-9 text-money-in" />
                </motion.span>
                <div>
                  <p className="text-base font-semibold">Backup sent</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    To <span className="font-medium text-foreground">{sent.to}</span>. It&apos;ll arrive in a minute or so.
                  </p>
                </div>
                {sent.fileName && <p className="num rounded-lg bg-surface-1 px-3 py-1.5 text-[11px] text-muted-foreground ring-1 ring-border">{sent.fileName}</p>}
                <button type="button" onClick={close} className={cn(option, "mt-2 justify-center text-sm font-medium")}>
                  Done
                </button>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center">
                {sending && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3 py-6 text-center" role="status">
                    <span className="grid size-20 place-items-center rounded-3xl bg-surface-1 ring-1 ring-border">
                      <motion.span
                        animate={still ? undefined : { x: [0, 4, 0], y: [0, -5, 0], rotate: [0, -8, 0] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Send className="size-8 text-lime-ink" />
                      </motion.span>
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Sending your backup…</p>
                      <p className="mt-1 text-xs text-muted-foreground">Building the zip and emailing it. This takes a few seconds.</p>
                    </div>
                    <span className="block h-1 w-40 overflow-hidden rounded-full bg-surface-2">
                      <motion.span
                        className="block h-full w-1/3 rounded-full bg-lime"
                        animate={still ? undefined : { x: ["-100%", "300%"] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </span>
                  </motion.div>
                )}
                {/* Kept mounted while sending, so a wrong PIN can still shake and show its message. */}
                <div className={cn(sending && "hidden")}>
                  <PinPad
                    check={async (pin) => {
                      if (step === "email") {
                        setSending(true);
                        const res = await emailBackupNow(pin);
                        setSending(false);
                        if (!res.ok) return res.error;
                        setSent({ to: res.emailedTo, fileName: res.fileName });
                        return null;
                      }
                      const res = await downloadBackup(pin);
                      if (!res.ok) return res.error;
                      setReady({ fileName: res.fileName, zip: res.zip });
                      return null;
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </>
  );
}
