"use client";

import { useState, useTransition } from "react";
import { Archive, ChevronRight, Download, Loader2, Mail, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { downloadBackup, emailBackupNow } from "@/app/actions/backup";
import { PinPad } from "@/components/pin-pad";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { daysBetween, formatDay, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type BackupStatus = { emailedAt: string | null; exportedAt: string | null; emailReady: boolean; emailConfigured: boolean };

/** The weekly email is late after this many days (it runs every Sunday). */
const LATE_DAYS = 9;

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
  const [saving, startSaving] = useTransition();
  const late = status.emailReady && !!status.emailedAt && daysBetween(todayISO(new Date(status.emailedAt)), todayISO()) > LATE_DAYS;
  const weekly = !status.emailReady ? "Not set up yet" : status.emailedAt ? `Sent ${when(status.emailedAt)}` : "On · first one this Sunday";

  const close = () => {
    setOpen(false);
    setStep("menu");
    setReady(null);
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
            {late ? "Weekly email is late" : "Download or email everything"}
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <ResponsiveSheetContent>
          <div className="flex flex-col gap-4 px-5 pt-2 pb-6 md:pt-5">
            <div>
              <SheetTitle className="text-base font-semibold">{ready ? "Backup ready" : step === "menu" ? "Backup" : "Enter your PIN"}</SheetTitle>
              <SheetDescription className="text-xs">
                {ready
                  ? `${ready.fileName} · ${(ready.zip.byteLength / 1024).toFixed(0)} KB. Save it to Files or iCloud Drive.`
                  : step === "menu"
                    ? "Everything in one zip: spreadsheet files and a full copy."
                    : "The backup includes your emergency fund."}
              </SheetDescription>
            </div>

            {ready ? (
              <button type="button" onClick={save} disabled={saving} className={cn(option, "justify-center font-medium disabled:opacity-60")}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Save backup
              </button>
            ) : step === "menu" ? (
              <>
                <dl className="flex flex-col gap-1.5 rounded-xl bg-surface-1 px-3 py-2.5 text-xs ring-1 ring-border">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Weekly email</dt>
                    <dd className="text-right">{weekly}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Last download</dt>
                    <dd className="text-right">{status.exportedAt ? when(status.exportedAt) : "Never"}</dd>
                  </div>
                </dl>
                {late && status.emailedAt && (
                  <p className="flex items-start gap-2 rounded-xl bg-budget-high/10 px-3 py-2 text-xs text-budget-high">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    The weekly email hasn&apos;t gone out since {when(status.emailedAt)}. Check the cron job in Vercel.
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
                        {status.emailConfigured ? "Sends the zip to your Gmail" : "Needs the Resend key in Vercel"}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-center">
                <PinPad
                  check={async (pin) => {
                    if (step === "email") {
                      const res = await emailBackupNow(pin);
                      if (!res.ok) return res.error;
                      toast.success(`Backup emailed to ${res.emailedTo}`);
                      close();
                      return null;
                    }
                    const res = await downloadBackup(pin);
                    if (!res.ok) return res.error;
                    setReady({ fileName: res.fileName, zip: res.zip });
                    return null;
                  }}
                />
              </div>
            )}
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </>
  );
}
