"use client";

import { useState, useTransition } from "react";
import { Archive, Download, Loader2, Lock, Mail, TriangleAlert } from "lucide-react";
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

/**
 * Backup (owner, Nov 11 2026): download everything as a zip, or email it.
 * Both ask for the PIN, since the backup includes the emergency fund.
 */
export function BackupCard({ status }: { status: BackupStatus }) {
  const [pinFor, setPinFor] = useState<"download" | "email" | null>(null);
  const [ready, setReady] = useState<{ fileName: string; zip: Uint8Array } | null>(null);
  const [saving, startSaving] = useTransition();
  const late = status.emailReady && (!status.emailedAt || daysBetween(todayISO(new Date(status.emailedAt)), todayISO()) > LATE_DAYS);

  // Saving needs a fresh tap (iOS only opens the share sheet from one), so it's a second button.
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
        setReady(null);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return; // closed the share sheet
        toast.error("Couldn't save the file.");
      }
    });

  return (
    <section className="rounded-2xl bg-surface-1 p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
          <Archive className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-medium">Backup</h2>
          <p className="text-xs text-muted-foreground">Everything in one zip: spreadsheet files and a full copy.</p>
        </div>
      </div>

      <dl className="mb-3 flex flex-col gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Weekly email</dt>
          <dd className="text-right">
            {!status.emailReady ? "Not set up yet" : status.emailedAt ? `Sent ${when(status.emailedAt)}` : "On · first one this Sunday"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Last download</dt>
          <dd className="text-right">{status.exportedAt ? when(status.exportedAt) : "Never"}</dd>
        </div>
      </dl>
      {late && status.emailedAt && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-budget-high/10 px-3 py-2 text-xs text-budget-high">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          The weekly email hasn&apos;t gone out since {when(status.emailedAt)}. Check the cron job in Vercel.
        </p>
      )}

      <div className={cn("grid gap-2", status.emailConfigured && "grid-cols-2")}>
        <button
          type="button"
          onClick={() => setPinFor("download")}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-on-lime active:scale-[0.98]"
        >
          <Download className="size-4" /> Download
        </button>
        {status.emailConfigured && (
          <button type="button" onClick={() => setPinFor("email")} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-medium">
            <Mail className="size-4" /> Email it now
          </button>
        )}
      </div>

      <Sheet open={!!pinFor || !!ready} onOpenChange={(o) => !o && (setPinFor(null), setReady(null))}>
        <ResponsiveSheetContent>
          <div className="flex flex-col items-center gap-5 px-6 pt-3 pb-6 md:pt-6">
            <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-lime-ink">
              {ready ? <Archive className="size-5" /> : <Lock className="size-5" />}
            </span>
            <div className="text-center">
              <SheetTitle className="text-lg font-semibold">{ready ? "Backup ready" : pinFor === "email" ? "Email a backup" : "Download a backup"}</SheetTitle>
              <SheetDescription className="text-xs">
                {ready
                  ? `${ready.fileName} · ${(ready.zip.byteLength / 1024).toFixed(0)} KB. Save it to Files or iCloud Drive.`
                  : "It includes your emergency fund, so enter your PIN."}
              </SheetDescription>
            </div>
            {ready ? (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-on-lime disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />} Save backup
              </button>
            ) : (
              pinFor && (
                <PinPad
                  check={async (pin) => {
                    if (pinFor === "email") {
                      const res = await emailBackupNow(pin);
                      if (!res.ok) return res.error;
                      toast.success(`Backup emailed to ${res.emailedTo}`);
                      setPinFor(null);
                      return null;
                    }
                    const res = await downloadBackup(pin);
                    if (!res.ok) return res.error;
                    setPinFor(null);
                    setReady({ fileName: res.fileName, zip: res.zip });
                    return null;
                  }}
                />
              )
            )}
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </section>
  );
}
