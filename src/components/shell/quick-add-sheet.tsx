"use client";

import type { ReactElement } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Placeholder for Quick-add (§7.5). The keypad → category grid → save flow is built in
 * phase 4, after the owner picks a layout from mockups.
 */
export function QuickAddSheet({ trigger }: { trigger: ReactElement }) {
  return (
    <Sheet>
      <SheetTrigger render={trigger} />
      <SheetContent side="bottom" className="rounded-t-3xl border-border pb-safe">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3" />
        <div className="px-5 pt-2 pb-8">
          <SheetTitle className="text-lg font-semibold">Quick add</SheetTitle>
          <SheetDescription>
            Amount keypad, then a category, then save. Coming in phase 4.
          </SheetDescription>
          <p className="num mt-6 text-5xl font-semibold tracking-tight text-muted-foreground">$0.00</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
