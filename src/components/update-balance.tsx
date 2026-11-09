"use client";

import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateBalance } from "@/app/actions/editing";
import { MoneyInput, centsToInput, toCents } from "@/components/money-input";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatCents } from "@/lib/money";

/**
 * "My bank says it's actually $X": sets the balance as of today. Transactions
 * after today add on; anything already in the bank's number isn't counted twice.
 */
export function UpdateBalance({
  accountId,
  name,
  current,
  debt,
  trigger,
  onSaved,
}: {
  accountId: string;
  name: string;
  /** Debts: amount owed (positive). Cash: balance. */
  current: number;
  debt: boolean;
  trigger: ReactElement;
  /** For screens that keep their own copy of the data (e.g. Investments). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(centsToInput(current));
  const [saving, start] = useTransition();
  const cents = toCents(value);

  const save = () =>
    cents != null &&
    start(async () => {
      const res = await updateBalance(accountId, cents);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${name}: ${formatCents(cents)}${debt ? " owed" : ""}`);
      setOpen(false);
      onSaved?.();
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(centsToInput(current));
      }}
    >
      <SheetTrigger render={trigger} />
      <ResponsiveSheetContent>
        <div className="flex flex-col gap-4 px-5 pt-2 pb-5 md:pt-5">
          <div>
            <SheetTitle className="text-lg font-semibold">Update balance</SheetTitle>
            <SheetDescription className="text-xs">
              {name}: enter what your bank shows {debt ? "you owe " : ""}today. The app shows {formatCents(current)}.
            </SheetDescription>
          </div>
          <MoneyInput value={value} onChange={setValue} size="lg" autoFocus ariaLabel={debt ? "Amount owed" : "Balance"} />
          {cents != null && cents !== current && (
            <p className="num text-xs text-muted-foreground">
              Difference: {formatCents(cents - current, { signed: true })}. Transactions you add later for dates up to today won&apos;t change it again.
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || cents == null}
            className="flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : "Save balance"}
          </button>
        </div>
      </ResponsiveSheetContent>
    </Sheet>
  );
}
