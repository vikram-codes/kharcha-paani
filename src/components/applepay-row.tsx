"use client";

import { useState, useTransition } from "react";
import { Check, ChevronRight, Copy, CreditCard, Loader2, RefreshCw, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { makeApplePayLink, setWalletCard, turnOffApplePay } from "@/app/actions/applepay";
import { ThemedSelect } from "@/components/themed-select";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { formatShort, todayISO } from "@/lib/dates";

export type ApplePaySettings = {
  link: { id: string; created_at: string; last_used_at: string | null } | null;
  cards: { wallet_name: string; account_id: string; last_seen_at: string }[];
  accounts: { id: string; name: string }[];
};

const day = (ts: string) => formatShort(todayISO(new Date(ts)));

/**
 * The Shortcuts setup, step by step. Since iOS 26 the trigger is called
 * "Wallet" (it was "Transaction" on iOS 17–18); labels can differ a little.
 */
const STEPS = [
  "Open the Shortcuts app → Automation → + (new automation) → Wallet. (On iOS 17–18 it's called Transaction.)",
  "Cards: select all of them (Triangle, Costco CIBC, Scene+ Visa, Scotia debit). Leave Categories and Merchants on Any. Choose Run Immediately and turn off Notify When Run. Tap Next.",
  "Tap New Blank Automation, then add the action Get Contents of URL.",
  "Paste your link as the URL. Tap the arrow to show more: Method POST, Request Body JSON.",
  "Add three Text fields: amount → Shortcut Input › Amount. merchant → Shortcut Input › Merchant. card → Shortcut Input › Card (its name).",
  "Tap Done. Your next Apple Pay tap lands in the app, with a notification.",
  "After an iOS update, check the automation is still on Run Immediately: updates can switch it back to Ask Before Running.",
];

/**
 * Settings → Apple Pay (#9, owner, Nov 11 2026): make the private add-only
 * link for the Shortcuts automation, see setup steps, and check which account
 * each Wallet card goes to.
 */
export function ApplePayRow({ settings }: { settings: ApplePaySettings }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, start] = useTransition();
  const on = !!settings.link || !!url;

  const make = () =>
    start(async () => {
      const res = await makeApplePayLink();
      if (!res.ok) return void toast.error(res.error);
      setUrl(res.url);
      setCopied(false);
    });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Press and hold the link to copy it.");
    }
  };

  const off = () => {
    if (!confirmOff) return setConfirmOff(true);
    start(async () => {
      const res = await turnOffApplePay();
      if (!res.ok) return void toast.error(res.error);
      setUrl(null);
      setConfirmOff(false);
      toast.success("Apple Pay link turned off");
    });
  };

  const subtitle = !on
    ? "Add Apple Pay purchases automatically"
    : settings.link?.last_used_at
      ? `On · last purchase ${day(settings.link.last_used_at)}`
      : "On · waiting for your first tap";
  const option = "flex w-full items-center gap-3 rounded-xl bg-surface-1 px-3 py-3 text-left ring-1 ring-border transition-colors duration-(--duration-fast) hover:bg-surface-2 disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
          <Smartphone className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Apple Pay</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setConfirmOff(false);
        }}
      >
        <ResponsiveSheetContent>
          <div className="flex flex-col gap-4 px-5 pt-2 pb-6 md:pt-5">
            <div>
              <SheetTitle className="text-base font-semibold">Apple Pay</SheetTitle>
              <SheetDescription className="text-xs">
                Every tap-to-pay purchase is added straight away: amount, place, card and a category from how you usually file it.
              </SheetDescription>
            </div>

            {url ? (
              <div className="flex flex-col gap-2 rounded-xl bg-surface-1 p-3 ring-1 ring-border">
                <p className="text-xs font-medium">Your link (shown once, keep it private)</p>
                <p className="num rounded-lg bg-surface-2 px-2.5 py-2 text-[11px] break-all select-all">{url}</p>
                <button type="button" onClick={copy} className={option}>
                  {copied ? <Check className="size-4 text-money-in" /> : <Copy className="size-4 text-muted-foreground" />}
                  <span className="flex-1 text-sm font-medium">{copied ? "Copied" : "Copy link"}</span>
                </button>
              </div>
            ) : (
              <button type="button" onClick={make} disabled={busy} className={option}>
                {on ? <RefreshCw className="size-4 text-muted-foreground" /> : <Smartphone className="size-4 text-muted-foreground" />}
                <span className="flex-1">
                  <span className="block text-sm font-medium">{on ? "Make a new link" : "Create my Apple Pay link"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {on ? `Active since ${day(settings.link!.created_at)}. A new one replaces it in the Shortcut.` : "You'll paste it into a Shortcuts automation"}
                  </span>
                </span>
                {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </button>
            )}

            <details className="rounded-xl bg-surface-1 px-3 py-2.5 ring-1 ring-border" open={!!url}>
              <summary className="cursor-pointer text-sm font-medium">Set up the Shortcut</summary>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-xs text-muted-foreground">
                {STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>

            {settings.cards.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="px-1 text-xs text-muted-foreground">Your Wallet cards</p>
                <div className="divide-y divide-border rounded-xl bg-surface-1 px-3 ring-1 ring-border">
                  {settings.cards.map((c) => (
                    <div key={c.wallet_name} className="flex items-center gap-3 py-2.5">
                      <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{c.wallet_name}</span>
                      <div className="w-40 shrink-0">
                        <ThemedSelect
                          size="sm"
                          ariaLabel={`Account for ${c.wallet_name}`}
                          value={c.account_id}
                          onChange={(v) =>
                            v &&
                            start(async () => {
                              const res = await setWalletCard(c.wallet_name, v);
                              if (!res.ok) toast.error(res.error);
                              else toast.success(`${c.wallet_name} → ${settings.accounts.find((a) => a.id === v)?.name}`);
                            })
                          }
                          options={settings.accounts.map((a) => ({ value: a.id, label: a.name }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {on && (
              <button type="button" onClick={off} disabled={busy} className={option}>
                <X className="size-4 text-budget-over" />
                <span className="flex-1 text-sm font-medium text-budget-over">{confirmOff ? "Tap again to turn it off" : "Turn off the link"}</span>
              </button>
            )}
          </div>
        </ResponsiveSheetContent>
      </Sheet>
    </>
  );
}
