import type { ReactNode } from "react";

/** Temporary screen body until the owner picks a layout from mockups (§9 design process). */
export function ScreenPlaceholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Phase {phase}
        </span>
      </header>
      {children}
    </div>
  );
}
