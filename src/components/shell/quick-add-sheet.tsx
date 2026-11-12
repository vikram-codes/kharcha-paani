"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactElement,
} from "react";
import { Delete, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { notifyDataChanged } from "@/lib/data-events";
import {
  addTransaction,
  addTransfer,
  loadQuickAdd,
} from "@/app/actions/transactions";
import { CategoryChip } from "@/components/category-icon";
import { ThemedSelect } from "@/components/themed-select";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import {
  Sheet,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { todayISO } from "@/lib/dates";
import { formatCents, parseToCents } from "@/lib/money";
import { enqueue, isNetworkError, newClientId } from "@/lib/outbox";
import { cn } from "@/lib/utils";

type Options = Awaited<ReturnType<typeof loadQuickAdd>>;
type Kind = "expense" | "income" | "transfer";

const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "0",
  "⌫",
] as const;
const SHOWN = 8;

/** "Scotiabank Scene+ Visa" → "Scene+ Visa", "Costco CIBC Mastercard" → "Costco CIBC". */
function shortName(name: string) {
  return name.replace(/^Scotiabank\s+/, "").replace(/\s+Mastercard$/, "");
}

/** Typed amount → next amount string (max 7 digits, 2 decimals). */
function press(current: string, key: string): string {
  if (key === "⌫") return current.slice(0, -1);
  if (key === ".")
    return current.includes(".") ? current : (current || "0") + ".";
  const [whole, frac] = current.split(".");
  if (frac !== undefined) return frac.length >= 2 ? current : current + key;
  if (whole.length >= 7) return current;
  return whole === "0" ? key : current + key;
}

/** A bill's details, filled in when quick-add opens from its "Add" badge. */
export type QuickAddPrefill = {
  label: string;
  cents: number; // signed: negative = expense
  categoryId: string | null;
  accountId: string | null;
  paysAccountId: string | null;
  date: string;
};

/**
 * The last accounts/categories loaded, kept on the phone so quick add opens
 * instantly, and works with no signal (owner, Nov 11 2026).
 */
const OPTIONS_KEY = "kp:qa-options";
function cachedOptions(): Options | null {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    // "today" is whatever today is now, not when they were saved.
    return raw ? { ...(JSON.parse(raw) as Options), today: todayISO() } : null;
  } catch {
    return null;
  }
}
function cacheOptions(o: Options) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    /* storage blocked */
  }
}

/** 55000 → "550", 27958 → "279.58" (what the keypad would have typed). */
const centsToTyped = (c: number) =>
  c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);

/**
 * Quick-add (§7.5): amount keypad → category → save, with "Paid from" (chequing
 * or a card) defaulting to the last account used. With `prefill` (a bill's Add
 * badge) it opens with the bill's amount, category, account and date set.
 */
export function QuickAddSheet({
  trigger,
  prefill,
}: {
  trigger: ReactElement;
  prefill?: QuickAddPrefill;
}) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [paysId, setPaysId] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const apply = (o: Options) => {
    setOpts(o);
    setAccountId((a) => a || o.lastAccountId || "");
    // Transfers default to chequing → the last card used (or the first card).
    setFromId(
      (f) =>
        f ||
        o.transferFrom.find((a) => /chequing/i.test(a.name))?.id ||
        o.transferFrom[0]?.id ||
        "",
    );
    setToId(
      (t) =>
        t ||
        (
          o.transferTo.find((a) => a.id === o.lastAccountId && a.card) ??
          o.transferTo.find((a) => a.card)
        )?.id ||
        "",
    );
    // A bill due tomorrow is entered today (no future dates).
    setDate((d) => (d && d <= o.today ? d : o.today));
  };

  const load = () => {
    const cached = cachedOptions();
    if (cached) apply(cached);
    startLoading(async () => {
      try {
        const o = await loadQuickAdd();
        cacheOptions(o);
        apply(o);
      } catch {
        // Offline: the saved choices above are used.
        if (!cached) toast.error("You're offline, and quick add hasn't been opened online on this phone yet.");
      }
    });
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Closing without saving discards the entry; each open starts clean
      // (or from the bill it was opened for).
      setKind(prefill && prefill.cents > 0 ? "income" : "expense");
      setAmount(prefill ? centsToTyped(Math.abs(prefill.cents)) : "");
      setCategoryId(prefill?.categoryId ?? null);
      setNote(prefill?.label ?? "");
      setShowAll(false);
      setDate(prefill?.date ?? "");
      setAccountId(prefill?.accountId ?? "");
      setPaysId(prefill?.paysAccountId ?? null);
      setFromId("");
      setToId("");
      load(); // fresh "last used" account + frequent categories each time
    }
  };

  // "12." is a valid in-progress entry: drop the trailing dot before parsing.
  const cents =
    amount && amount !== "."
      ? parseToCents(amount.replace(/\.$/, "") || "0")
      : 0;
  const cats = (kind === "expense" ? opts?.expense : opts?.income) ?? [];
  const top = cats.slice(0, SHOWN);
  // A pre-filled category that isn't among the frequent ones still shows, selected.
  const picked =
    categoryId && !top.some((c) => c.id === categoryId)
      ? cats.find((c) => c.id === categoryId)
      : undefined;
  const visible = showAll
    ? cats
    : picked
      ? [picked, ...top.slice(0, SHOWN - 1)]
      : top;
  const isTransfer = kind === "transfer";
  const canSave = isTransfer
    ? cents > 0 && !!fromId && !!toId && fromId !== toId && !saving
    : cents > 0 && !!categoryId && !!accountId && !saving;

  const done = () => {
    setAmount("");
    setCategoryId(null);
    setNote("");
    setOpen(false);
  };

  const save = useCallback(() => {
    if (!canSave) return;
    const clientId = newClientId();
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    // No signal: keep it on the phone; it syncs when the connection is back.
    const keep = (item: Parameters<typeof enqueue>[0]) => {
      enqueue(item);
      toast.success(`${formatCents(cents)} saved offline · syncs when you're back online`);
      done();
    };
    const account = (id: string) => shortName(opts?.accounts.find((a) => a.id === id)?.name ?? opts?.transferTo.find((a) => a.id === id)?.name ?? "");
    if (isTransfer) {
      const input = { fromId, toId, cents, date, note, clientId };
      const item = { id: clientId, kind: "transfer" as const, input, cents: -cents, label: `${account(fromId) || "Transfer"} → ${account(toId)}` };
      if (offline) return keep(item);
      startSaving(async () => {
        let res;
        try {
          res = await addTransfer(input);
        } catch (e) {
          if (isNetworkError(e)) return keep(item);
          throw e;
        }
        if (!res.ok) return void toast.error(res.error);
        toast.success(`${formatCents(cents)} · ${res.message}`);
        setAmount("");
        setNote("");
        setOpen(false);
        notifyDataChanged();
      });
      return;
    }
    if (!categoryId || isTransfer) return;
    const input = {
      kind: kind as "expense" | "income",
      amountCents: cents,
      accountId,
      categoryId,
      date,
      note,
      // The bill's debt link only applies while it's still that bill's category.
      paysAccountId:
        kind === "expense" && categoryId === prefill?.categoryId
          ? paysId
          : null,
      clientId,
    };
    const catName = [...(opts?.expense ?? []), ...(opts?.income ?? [])].find((c) => c.id === categoryId)?.name ?? "Entry";
    const item = {
      id: clientId,
      kind: "tx" as const,
      input,
      cents: kind === "expense" ? -cents : cents,
      label: `${note.trim() || catName} · ${account(accountId)}`,
    };
    if (offline) return keep(item);
    startSaving(async () => {
      let res;
      try {
        res = await addTransaction(input);
      } catch (e) {
        if (isNetworkError(e)) return keep(item);
        throw e;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${kind === "expense" ? "−" : "+"}${formatCents(cents)} · ${res.message}`,
      );
      setAmount("");
      setCategoryId(null);
      setNote("");
      setOpen(false);
      notifyDataChanged();
    });
  }, [
    canSave,
    isTransfer,
    fromId,
    toId,
    categoryId,
    kind,
    cents,
    accountId,
    date,
    note,
    paysId,
    prefill?.categoryId,
    opts,
  ]);

  // Desktop: type the amount, Enter to save.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "SELECT" ||
        t.tagName === "TEXTAREA"
      )
        return;
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
            <SheetDescription className="sr-only">
              Enter an amount, pick a category and where it was paid from.
            </SheetDescription>
            <div
              className="flex rounded-full bg-surface-1 p-1 text-xs font-medium"
              role="tablist"
            >
              {(["expense", "income", "transfer"] as const).map((k) => (
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
                    kind === k
                      ? "bg-surface-3 text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {k === "expense"
                    ? "Expense"
                    : k === "income"
                      ? "Money in"
                      : "Transfer"}
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
          {prefill && (
            <p className="-mt-3 text-center text-xs text-muted-foreground">
              From your bills · {prefill.label}
            </p>
          )}

          {isTransfer && (
            <div className="flex flex-col gap-2">
              <ThemedSelect
                ariaLabel="Transfer from"
                prefix="From"
                value={fromId || null}
                onChange={(v) => v && setFromId(v)}
                disabled={!opts}
                placeholder="Loading…"
                options={(opts?.transferFrom ?? []).map((a) => ({
                  value: a.id,
                  label: shortName(a.name),
                  hint: a.last4 ? `••${a.last4}` : undefined,
                }))}
              />
              <ThemedSelect
                ariaLabel="Transfer to"
                prefix="To"
                value={toId || null}
                onChange={(v) => v && setToId(v)}
                disabled={!opts}
                placeholder="Loading…"
                options={(opts?.transferTo ?? [])
                  .filter((a) => a.id !== fromId)
                  .map((a) => ({
                    value: a.id,
                    label: shortName(a.name),
                    hint: a.card
                      ? `card payment${a.last4 ? ` · ••${a.last4}` : ""}`
                      : a.last4
                        ? `••${a.last4}`
                        : undefined,
                  }))}
              />
              <p className="px-1 text-[11px] text-muted-foreground">
                Not spending: the money leaves{" "}
                {fromId ? "the bank account" : "chequing"} and lowers what you
                owe on the card (or moves to savings).
              </p>
            </div>
          )}

          {/* Paid from + date */}
          <div
            className={cn(
              "grid gap-2",
              isTransfer ? "grid-cols-1" : "grid-cols-[1fr_auto]",
            )}
          >
            {!isTransfer && (
              <ThemedSelect
                ariaLabel={kind === "expense" ? "Paid from" : "Deposited to"}
                prefix={kind === "expense" ? "From" : "Into"}
                value={accountId || null}
                onChange={(v) => v && setAccountId(v)}
                disabled={!opts}
                placeholder="Loading…"
                options={(opts?.accounts ?? []).map((a) => ({
                  value: a.id,
                  label: shortName(a.name),
                  hint: a.last4 ? `••${a.last4}` : undefined,
                }))}
              />
            )}
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
          {!isTransfer && (
            <div>
              <div className="grid grid-cols-4 gap-2">
                {loading && !opts
                  ? Array.from({ length: SHOWN }, (_, i) => (
                      <span
                        key={i}
                        className="h-[68px] animate-pulse rounded-xl bg-surface-1"
                      />
                    ))
                  : visible.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoryId(c.id)}
                        aria-pressed={categoryId === c.id}
                        className={cn(
                          "flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl bg-surface-1 px-1 transition-colors duration-(--duration-fast)",
                          categoryId === c.id
                            ? "bg-surface-2 ring-2 ring-lime"
                            : "hover:bg-surface-2",
                        )}
                      >
                        <CategoryChip icon={c.icon} color={c.color} size="sm" />
                        <span className="line-clamp-1 text-[11px] leading-tight">
                          {c.name.replace(/\s*\(.*\)$/, "")}
                        </span>
                      </button>
                    ))}
              </div>
              {cats.length > SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  {showAll
                    ? "Fewer categories"
                    : `All ${cats.length} categories`}
                </button>
              )}
            </div>
          )}

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

          {/* Note sits with Save, so the phone keyboard opens under both
              (not under the number pad). */}
          <div data-keyboard-group className="flex flex-col gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Note (optional)"
              enterKeyHint="done"
              maxLength={200}
              className="h-11 rounded-xl bg-surface-1 px-3 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-lime"
            />
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : cents > 0 ? (
                `${isTransfer ? (opts?.transferTo.find((a) => a.id === toId)?.card ? "Pay" : "Move") : "Save"} ${formatCents(cents)}`
              ) : isTransfer ? (
                "Transfer"
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </ResponsiveSheetContent>
    </Sheet>
  );
}
