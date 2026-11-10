"use client";

import { Lock } from "lucide-react";
import { unlockEmergency } from "@/app/actions/emergency";
import { PinPad } from "@/components/pin-pad";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/**
 * PIN keypad that unlocks the emergency fund. The amount comes back from the
 * server only after the PIN checks out; it isn't in the page before that.
 */
export function EmergencyPinSheet({
  open,
  onOpenChange,
  institution,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institution?: string | null;
  onUnlocked: (cents: number) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <ResponsiveSheetContent>
        <div className="flex flex-col items-center gap-5 px-6 pt-3 pb-6 md:pt-6">
          <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-lime-ink">
            <Lock className="size-5" />
          </span>
          <div className="text-center">
            <SheetTitle className="text-lg font-semibold">Emergency fund</SheetTitle>
            <SheetDescription className="text-xs">Enter your PIN to show the balance{institution ? ` at ${institution}` : ""}.</SheetDescription>
          </div>
          {open && (
            <PinPad
              check={async (pin) => {
                const res = await unlockEmergency(pin);
                if (!res.ok) return res.error;
                onUnlocked(res.cents);
                onOpenChange(false);
                return null;
              }}
            />
          )}
        </div>
      </ResponsiveSheetContent>
    </Sheet>
  );
}
