"use client";

import { Fragment } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { CategoryChip } from "@/components/category-icon";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Small text under/after the label (e.g. "Food", "••5771"). */
  hint?: string;
  icon?: string | null;
  color?: string | null;
  group?: string;
};

/**
 * App-styled dropdown (replaces native <select>): matches the input fields,
 * shows category icons, groups options, lime check on the selected one.
 * `value === null` shows the placeholder.
 */
export function ThemedSelect({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  prefix,
  size = "md",
  ariaLabel,
  disabled,
  className,
  warn,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Text before the value inside the trigger, e.g. "From". */
  prefix?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Highlight the trigger (e.g. no category chosen yet). */
  warn?: boolean;
}) {
  const selected = options.find((o) => o.value === value) ?? null;
  const groups = options.reduce<[string, SelectOption[]][]>((acc, o) => {
    const g = o.group ?? "";
    const last = acc[acc.length - 1];
    if (last && last[0] === g) last[1].push(o);
    else acc.push([g, [o]]);
    return acc;
  }, []);

  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange((v as string | null) ?? null)} disabled={disabled} items={options}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-xl bg-surface-1 text-left ring-1 ring-border outline-none transition-shadow duration-(--duration-fast) focus-visible:ring-2 focus-visible:ring-lime data-[popup-open]:ring-2 data-[popup-open]:ring-lime disabled:opacity-50",
          size === "md" ? "h-11 px-3 text-sm" : "h-9 px-2.5 text-xs",
          warn && !selected && "ring-budget-high/60",
          className,
        )}
      >
        {selected?.icon !== undefined && selected && <CategoryChip icon={selected.icon} color={selected.color} size="sm" className={size === "sm" ? "size-6 rounded-lg" : "size-7 rounded-lg"} />}
        <span className={cn("min-w-0 flex-1 truncate", !selected && (warn ? "text-budget-high" : "text-muted-foreground"))}>
          {prefix && <span className="text-muted-foreground">{prefix} </span>}
          {selected ? selected.label : placeholder}
          {selected?.hint && <span className="text-muted-foreground"> · {selected.hint}</span>}
        </span>
        <SelectPrimitive.Icon className="shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) data-[popup-open]:rotate-180">
          <ChevronDown className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={6} alignItemWithTrigger={false} className="isolate z-[60]">
          <SelectPrimitive.Popup
            className={cn(
              "max-h-[min(var(--available-height),360px)] w-(--anchor-width) min-w-56 origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-2xl bg-surface-2 p-1.5 shadow-2xl ring-1 ring-border",
              "transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            <SelectPrimitive.List>
              {groups.map(([group, list]) => (
                <Fragment key={group || "_"}>
                  {group ? (
                    <SelectPrimitive.Group>
                      <SelectPrimitive.GroupLabel className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{group}</SelectPrimitive.GroupLabel>
                      {list.map((o) => (
                        <Item key={o.value} o={o} />
                      ))}
                    </SelectPrimitive.Group>
                  ) : (
                    list.map((o) => <Item key={o.value} o={o} />)
                  )}
                </Fragment>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function Item({ o }: { o: SelectOption }) {
  return (
    <SelectPrimitive.Item
      value={o.value}
      className="flex cursor-default items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-surface-3 data-[selected]:font-medium"
    >
      {o.icon !== undefined && <CategoryChip icon={o.icon} color={o.color} size="sm" className="size-7 rounded-lg" />}
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {o.label}
        {o.hint && <span className="text-muted-foreground"> · {o.hint}</span>}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="shrink-0 text-lime-ink">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
