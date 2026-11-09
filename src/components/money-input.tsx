"use client";

import { cn } from "@/lib/utils";

/** "$ 1,234.56" text field that keeps digits and one decimal point (2 places). */
export function MoneyInput({
  value,
  onChange,
  prefix = "$",
  className,
  ariaLabel,
  autoFocus,
  size = "md",
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <label
      className={cn(
        "flex items-center rounded-xl bg-surface-1 px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-lime",
        size === "lg" ? "h-14" : "h-11",
        className,
      )}
    >
      <span className="num shrink-0 whitespace-nowrap text-muted-foreground">{prefix}</span>
      <input
        value={value}
        autoFocus={autoFocus}
        inputMode="decimal"
        aria-label={ariaLabel}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, "");
          const [w, ...rest] = v.split(".");
          onChange(rest.length ? `${w}.${rest.join("").slice(0, 2)}` : w);
        }}
        className={cn("num h-full w-full min-w-0 bg-transparent pl-1 font-semibold outline-none", size === "lg" ? "text-2xl" : "text-base")}
      />
    </label>
  );
}

/** "12.5" → 1250 cents; "" or invalid → null. */
export function toCents(v: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(v)) return null;
  const [w, f = ""] = v.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}

export const centsToInput = (c: number) => (Math.abs(c) / 100).toFixed(2);
