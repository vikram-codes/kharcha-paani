import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { AnimatedCents } from "@/components/animated-number";

/** Balance tile (Cash / Debts / Investments). Row on phones; icon-on-top card on desktop. */
export function HomeTile({
  href,
  icon: Icon,
  label,
  value,
  sub,
  extra,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  sub: string;
  extra?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-w-0 items-center gap-4 rounded-2xl bg-surface-1 p-4 transition-colors duration-(--duration-fast) hover:bg-surface-2 active:scale-[0.99] md:flex-col md:items-stretch md:gap-4 md:p-5"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-lime-ink group-hover:bg-surface-3">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        <AnimatedCents value={value} className="num truncate text-2xl font-semibold tracking-tight" />
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
        {extra && <span className="num mt-0.5 truncate text-xs text-muted-foreground/60">{extra}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground md:absolute md:top-5 md:right-5" />
    </Link>
  );
}
