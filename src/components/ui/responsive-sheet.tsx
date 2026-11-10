"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Height of the on-screen keyboard (iOS/Android) from the visual viewport, so a
 * bottom sheet can sit just above it instead of behind it. 0 when no keyboard.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 80 ? Math.round(covered) : 0); // ignore toolbars, only real keyboards
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/**
 * Bottom sheet on phones, centered dialog on desktop (md+). The md: variants
 * repeat `data-[side=bottom]` so they out-rank the sheet's own bottom styles.
 * On phones the sheet rises above the keyboard and the focused field scrolls
 * into view, so you always see what you're typing.
 */
export function ResponsiveSheetContent({ className, children, style, ...props }: Omit<ComponentProps<typeof SheetContent>, "side">) {
  const keyboard = useKeyboardInset();

  // Keep the focused field visible once the sheet has moved above the keyboard
  // (after its 200ms slide). A field inside [data-keyboard-group] brings the
  // whole group along, e.g. the note together with the Save button under it.
  useEffect(() => {
    if (!keyboard) return;
    const el = document.activeElement as HTMLElement | null;
    if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    const target = el.closest<HTMLElement>("[data-keyboard-group]") ?? el;
    const t = setTimeout(() => target.scrollIntoView({ block: "end", behavior: "smooth" }), 220);
    return () => clearTimeout(t);
  }, [keyboard]);

  return (
    <SheetContent
      side="bottom"
      style={keyboard ? { ...style, bottom: keyboard, maxHeight: `calc(100dvh - ${keyboard}px - env(safe-area-inset-top) - 12px)` } : style}
      className={cn(
        // Always leave a strip of page above the sheet to tap and close it.
        "max-h-[calc(100dvh-env(safe-area-inset-top)-4.5rem)] overflow-y-auto overscroll-contain rounded-t-3xl border-border pb-safe transition-[bottom] duration-200 ease-out",
        keyboard > 0 && "rounded-b-3xl pb-3",
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
