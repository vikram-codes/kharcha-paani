"use client";

import { useCallback, useEffect, useState, useTransition, type ReactElement } from "react";
import { Delete, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addTransaction, loadQuickAdd } from "@/app/actions/transactions";
import { CategoryChip } from "@/components/category-icon";
import { ThemedSelect } from "@/components/themed-select";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatCents, parseToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Options = Awaited<ReturnType<typeof loadQuickAdd>>;
type Kind = "expense" | "income";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;
const SHOWN = 8;

/** "Scotiabank Scene+ Visa" → "Scene+ Visa", "Costco CIBC Mastercard" → "Costco CIBC". */
function shortName(name: string) {
  return name.replace(/^Scotiabank\s+/, "").replace(/\s+Mastercard$/, "");
}

/** Typed amount → next amount string (max 7 digits, 2 decimals). */
function press(current: string, key: string): string {
  if (key === "⌫") return current.slice(0, -1);
  if (key === ".") return current.includes(".") ? current : (current || "0") + ".";
  const [whole, frac] = current.split(".");
  if (frac !== undefined) return frac.length >= 2 ? current : current + key;
  if (whole.length >= 7) return current;
  return whole === "0" ? key : current + key;
}

/**
 * Quick-add (§7.5): amount keypad → category → save, with "Paid from" (chequing
 * or a card) defaulting to the last account used.
 */
export function QuickAddSheet({ trigger }: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = () =>
    startLoading(async () => {
      const o = await loadQuickAdd();
      setOpts(o);
      setAccountId((a) => a || o.lastAccountId || "");
      setDate((d) => d || o.today);
    });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Closing without saving discards the entry; each open starts clean.
      setAmount("");
      setCategoryId(null);
      setNote("");
      setShowAll(false);
      setDate("");
      setAccountId("");
      load(); // fresh "last used" account + frequent categories each time
    }
  };

  // "12." is a valid in-progress entry: drop the trailing dot before parsing.
  const cents = amount && amount !== "." ? parseToCents(amount.replace(/\.$/, "") || "0") : 0;
  const cats = (kind === "expense" ? opts?.expense : opts?.income) ?? [];
  const visible = showAll ? cats : cats.slice(0, SHOWN);
  const canSave = cents > 0 && !!categoryId && !!accountId && !saving;

  const save = useCallback(() => {
    if (!canSave || !categoryId) return;
    startSaving(async () => {
      const res = await addTransaction({ kind, amountCents: cents, accountId, categoryId, date, note });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${kind === "expense" ? "−" : "+"}${formatCents(cents)} · ${res.message}`);
      setAmount("");
      setCategoryId(null);
      setNote("");
      setOpen(false);
    });
  }, [canSave, categoryId, kind, cents, accountId, date, note]);

  // Desktop: type the amount, Enter to save.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      if (/^[0-9.]$/.test(e.key)) setAmount((a) => press(a, e.key));
      else if (e.key === "Backspace") setAmount((a) => press(a, "⌫"));
      else if (e.key === "Enter") save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, save]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger} />
      <ResponsiveSheetContent showCloseButton={false}>
        <div className="flex flex-col gap-4 px-5 pt-2 pb-5 md:pt-5">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold">Add</SheetTitle>
            <SheetDescription className="sr-only">Enter an amount, pick a category and where it was paid from.</SheetDescription>
            <div className="flex rounded-full bg-surface-1 p-1 text-xs font-medium" role="tablist">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => {
                    setKind(k);
                    setCategoryId(null);
                    setShowAll(false);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 transition-colors duration-(--duration-fast)",
                    kind === k ? "bg-surface-3 text-foreground" : "text-muted-foreground",
                  )}
                >
                  {k === "expense" ? "Expense" : "Money in"}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <p
            className={cn(
              "num text-center text-5xl font-semibold tracking-tight",
              !amount && "text-muted-foreground/50",
              kind === "income" && amount && "text-money-in",
            )}
            aria-live="polite"
          >
            ${amount || "0"}
          </p>

          {/* Paid from + date */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <ThemedSelect
              ariaLabel={kind === "expense" ? "Paid from" : "Deposited to"}
              prefix={kind === "expense" ? "From" : "Into"}
              value={accountId || null}
              onChange={(v) => v && setAccountId(v)}
              disabled={!opts}
              placeholder="Loading…"
              options={(opts?.accounts ?? []).map((a) => ({ value: a.id, label: shortName(a.name), hint: a.last4 ? `••${a.last4}` : undefined }))}
            />
            <input
              type="date"
              value={date}
              max={opts?.today}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              className="h-11 rounded-xl bg-surface-1 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime"
            />
          </div>

          {/* Categories */}
          <div>
            <div className="grid grid-cols-4 gap-2">
              {loading && !opts
                ? Array.from({ length: SHOWN }, (_, i) => <span key={i} className="h-[68px] animate-pulse rounded-xl bg-surface-1" />)
                : visible.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      aria-pressed={categoryId === c.id}
                      className={cn(
                        "flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl bg-surface-1 px-1 transition-colors duration-(--duration-fast)",
                        categoryId === c.id ? "bg-surface-2 ring-2 ring-lime" : "hover:bg-surface-2",
                      )}
                    >
                      <CategoryChip icon={c.icon} color={c.color} size="sm" />
                      <span className="line-clamp-1 text-[11px] leading-tight">{c.name.replace(/\s*\(.*\)$/, "")}</span>
                    </button>
                  ))}
            </div>
            {cats.length > SHOWN && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground">
                {showAll ? "Fewer categories" : `All ${cats.length} categories`}
              </button>
            )}
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            maxLength={200}
            className="h-11 rounded-xl bg-surface-1 px-3 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-lime"
          />

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setAmount((a) => press(a, k))}
                aria-label={k === "⌫" ? "Delete" : k}
                className="num grid h-12 place-items-center rounded-xl bg-surface-1 text-xl font-medium transition-transform duration-(--duration-fast) active:scale-95 active:bg-surface-2"
              >
                {k === "⌫" ? <Delete className="size-5" /> : k}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : cents > 0 ? `Save ${formatCents(cents)}` : "Save"}
          </button>
        </div>
      </ResponsiveSheetContent>
    </Sheet>
  );
}
