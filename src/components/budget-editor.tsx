"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { saveBudget } from "@/app/actions/editing";
import { CategoryChip } from "@/components/category-icon";
import { MoneyInput, centsToInput, toCents } from "@/components/money-input";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatMonthName } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Line = { id: string; name: string; kind: "fixed" | "variable"; budget: number; icon: string | null; color: string | null };

/** Edit the monthly total and every budget line, for this month or from now on. */
export function BudgetEditor({ month, total, lines }: { month: string; total: number | null; lines: Line[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"month" | "default">("default");
  const [totalIn, setTotalIn] = useState(total != null ? centsToInput(total) : "");
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, centsToInput(l.budget)])));
  const [saving, startSaving] = useTransition();

  // Unsaved edits are thrown away: every time the sheet opens it starts from the saved budget.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setScope("default");
      setTotalIn(total != null ? centsToInput(total) : "");
      setValues(Object.fromEntries(lines.map((l) => [l.id, centsToInput(l.budget)])));
    }
    setOpen(next);
  };

  const parsed = lines.map((l) => ({ id: l.id, cents: toCents(values[l.id] ?? "") }));
  const linesTotal = parsed.reduce((t, l) => t + (l.cents ?? 0), 0);
  const totalCents = toCents(totalIn);
  const invalid = parsed.some((l) => l.cents == null) || (totalIn !== "" && totalCents == null);

  const save = () =>
    startSaving(async () => {
      const changed = parsed.filter((p, i) => p.cents !== lines[i].budget) as { id: string; cents: number }[];
      const res = await saveBudget({ month, scope, totalCents: totalCents !== total ? totalCents : null, lines: changed });
      if (!res.ok) return void toast.error(res.error);
      toast.success(scope === "month" ? `Budget updated for ${formatMonthName(month)}` : "Budget updated from now on");
      setOpen(false);
      router.refresh();
    });

  const section = (kind: Line["kind"]) => (
    <div>
      <h3 className="mb-1 px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">{kind === "fixed" ? "Fixed" : "Variable"}</h3>
      <div className="flex flex-col gap-1.5">
        {lines
          .filter((l) => l.kind === kind)
          .map((l) => (
            <div key={l.id} className="flex items-center gap-3">
              <CategoryChip icon={l.icon} color={l.color} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
              <MoneyInput value={values[l.id] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [l.id]: v }))} className="w-32" ariaLabel={`${l.name} budget`} />
            </div>
          ))}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <button type="button" className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Pencil className="size-3" /> Edit
          </button>
        }
      />
      <ResponsiveSheetContent>
        <div className="flex flex-col gap-4 px-5 pt-2 pb-5 md:pt-5">
          <div>
            <SheetTitle className="text-lg font-semibold">Edit budget</SheetTitle>
            <SheetDescription className="text-xs">Amounts per month. Fixed bills use what you expect to pay.</SheetDescription>
          </div>

          <div className="flex rounded-full bg-surface-1 p-1 text-xs font-medium">
            {(["default", "month"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn("flex-1 rounded-full py-1.5", scope === s ? "bg-surface-3 text-foreground" : "text-muted-foreground")}
              >
                {s === "default" ? "From now on" : `Only ${formatMonthName(month)}`}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-surface-1 p-3">
            <div className="flex items-center gap-3">
              <span className="flex-1">
                <span className="block text-sm font-medium">Monthly total</span>
                <span className="block text-xs text-muted-foreground">The headline number on Home and Budgets</span>
              </span>
              <MoneyInput value={totalIn} onChange={setTotalIn} className="w-32 bg-surface-2" ariaLabel="Monthly total" />
            </div>
            <p className={cn("num mt-2 text-xs", totalCents != null && linesTotal > totalCents ? "text-budget-high" : "text-muted-foreground")}>
              Lines add up to {formatCents(linesTotal)}
              {totalCents != null && (linesTotal > totalCents ? ` · ${formatCents(linesTotal - totalCents)} over the total` : ` · ${formatCents(totalCents - linesTotal)} buffer`)}
            </p>
          </div>

          {section("fixed")}
          {section("variable")}

          <button
            type="button"
            onClick={save}
            disabled={saving || invalid}
            className="sticky bottom-0 flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : "Save budget"}
          </button>
        </div>
      </ResponsiveSheetContent>
    </Sheet>
  );
}
