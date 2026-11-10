import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { FeedRow } from "./format";

/** Money in green, spending plain, transfers dark yellow from chequing's side (− out, + in). */
export function Amount({ r, className }: { r: FeedRow; className?: string }) {
  const cents = r.isTransfer ? (r.flow ?? r.amount_cents) : r.amount_cents;
  return (
    <span
      className={cn(
        "num text-sm",
        r.isTransfer ? "text-transfer" : cents > 0 && "text-money-in",
        className,
      )}
    >
      {formatCents(cents, { signed: cents > 0 })}
    </span>
  );
}
