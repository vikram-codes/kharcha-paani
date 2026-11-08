"use client";

import type { ComponentProps } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on phones, centered dialog on desktop (md+). The md: variants
 * repeat `data-[side=bottom]` so they out-rank the sheet's own bottom styles.
 */
export function ResponsiveSheetContent({ className, children, ...props }: Omit<ComponentProps<typeof SheetContent>, "side">) {
  return (
    <SheetContent
      side="bottom"
      className={cn(
        "max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border pb-safe",
        "md:data-[side=bottom]:inset-0 md:data-[side=bottom]:m-auto md:data-[side=bottom]:h-fit md:data-[side=bottom]:max-h-[85dvh]",
        "md:data-[side=bottom]:w-[min(460px,calc(100vw-2rem))] md:data-[side=bottom]:rounded-3xl md:data-[side=bottom]:border md:data-[side=bottom]:pb-0",
        "md:data-[side=bottom]:data-starting-style:translate-y-3 md:data-[side=bottom]:data-ending-style:translate-y-3",
        "md:data-[side=bottom]:data-starting-style:scale-[0.98] md:data-[side=bottom]:data-ending-style:scale-[0.98]",
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-surface-3 md:hidden" />
      {children}
    </SheetContent>
  );
}
