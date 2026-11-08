"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Split, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  loadEditOptions,
  removeTransaction,
  saveTransaction,
} from "@/app/actions/activity";
import { CategoryChip } from "@/components/category-icon";
import { ThemedSelect, type SelectOption } from "@/components/themed-select";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { ActivityRow } from "@/lib/data";
import { formatCents, parseToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { rowTitle } from "./format";

type Options = Awaited<ReturnType<typeof loadEditOptions>>;

const KIND_LABEL: Record<string, string> = {
  expense: "Spending",
  income: "Income",
  transfer: "Transfers",
  reimbursement: "Paid back",
  adjustment: "Adjustments",
};

/** Categories as grouped dropdown options (Spending, Income, Transfers…). */
export function categoryOptions(opts: Options | null): SelectOption[] {
  return (opts?.categories ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    hint: c.parent ?? undefined,
    icon: c.icon,
    color: c.color,
    group: KIND_LABEL[c.kind] ?? c.kind,
  }));
}

const field =
  "h-11 w-full rounded-xl bg-surface-1 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime";

/** View / edit / delete one transaction. */
export function TransactionSheet({
  row,
  onClose,
  onChanged,
}: {
  row: ActivityRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [opts, setOpts] = useState<Options | null>(null);
  // Options are loaded once, the first time a row opens.
  useEffect(() => {
    if (row && !opts) loadEditOptions().then(setOpts);
  }, [row, opts]);

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveSheetContent>
        {/* keyed by row: each opened transaction starts with a fresh form */}
        {row && (
          <EditForm
            key={row.id}
            row={row}
            opts={opts}
            onClose={onClose}
            onChanged={onChanged}
          />
        )}
      </ResponsiveSheetContent>
    </Sheet>
  );
}

function EditForm({
  row,
  opts,
  onClose,
  onChanged,
}: {
  row: ActivityRow;
  opts: Options | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [out, setOut] = useState(row.amount_cents < 0);
  const [amount, setAmount] = useState(
    (Math.abs(row.amount_cents) / 100).toFixed(2),
  );
  const [categoryId, setCategoryId] = useState<string>(row.category?.id ?? "");
  const [accountId, setAccountId] = useState(row.accountId);
  const [date, setDate] = useState(row.date);
  const [note, setNote] = useState(row.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, startBusy] = useTransition();

  const legacyAccount =
    opts && !opts.accounts.some((a) => a.id === row.accountId);
  let cents = 0;
  try {
    cents = amount ? parseToCents(amount.replace(/\.$/, "")) : 0;
  } catch {
    cents = 0;
  }

  const save = () => {
    if (cents <= 0) return;
    startBusy(async () => {
      const res = await saveTransaction(row.id, {
        amountCents: out ? -cents : cents,
        categoryId: categoryId || null,
        accountId,
        date,
        note: note || null,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Saved");
      onChanged();
      onClose();
    });
  };

  const remove = () => {
    if (!confirmDelete) return setConfirmDelete(true);
    startBusy(async () => {
      const res = await removeTransaction(row.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Deleted");
      onChanged();
      onClose();
    });
  };

  const selected = opts?.categories.find((c) => c.id === categoryId);

  return (
    <div className="flex flex-col gap-4 px-5 pt-2 pb-5 md:pt-5">
      <div className="flex items-center gap-3 pr-8">
        <CategoryChip
          icon={selected?.icon ?? row.category?.icon}
          color={selected?.color ?? row.category?.color}
        />
        <div className="min-w-0">
          <SheetTitle className="truncate text-base font-semibold">
            {rowTitle(row)}
          </SheetTitle>
          <SheetDescription className="truncate text-xs">
            {row.description}
          </SheetDescription>
        </div>
      </div>

      {/* Amount + direction */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-surface-1 p-1 text-xs font-medium">
          {[true, false].map((o) => (
            <button
              key={String(o)}
              type="button"
              onClick={() => setOut(o)}
              className={cn(
                "rounded-full px-3 py-1.5",
                out === o
                  ? "bg-surface-3 text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {o ? "Out" : "In"}
            </button>
          ))}
        </div>
        <label className="flex h-11 flex-1 items-center rounded-xl bg-surface-1 px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-lime">
          <span className="num shrink-0 whitespace-nowrap text-muted-foreground">{out ? "−$" : "+$"}</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            aria-label="Amount"
            className="num h-full w-full bg-transparent pl-1 text-lg font-semibold outline-none"
          />
        </label>
      </div>

      {/* Category */}
      {row.splits.length > 0 ? (
        <div className="rounded-xl bg-surface-1 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Split className="size-3" /> Split across categories
          </p>
          {row.splits.map((s, i) => (
            <p key={i} className="flex justify-between py-0.5">
              <span>{s.name}</span>
              <span className="num">{formatCents(s.amount_cents)}</span>
            </p>
          ))}
        </div>
      ) : (
        <div>
          <span className="mb-1 block px-1 text-xs text-muted-foreground">
            Category
          </span>
          <ThemedSelect
            ariaLabel="Category"
            value={categoryId || null}
            onChange={(v) => setCategoryId(v ?? "")}
            disabled={!opts}
            placeholder="Uncategorized"
            options={categoryOptions(opts)}
          />
        </div>
      )}

      {/* Account + date */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <span className="mb-1 block px-1 text-xs text-muted-foreground">
            Account
          </span>
          {legacyAccount ? (
            <span
              className={cn(field, "flex items-center text-muted-foreground")}
            >
              {row.account}
            </span>
          ) : (
            <ThemedSelect
              ariaLabel="Account"
              value={accountId}
              onChange={(v) => v && setAccountId(v)}
              disabled={!opts}
              options={(opts?.accounts ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.last4 ? `••${a.last4}` : undefined }))}
            />
          )}
        </div>
        <label>
          <span className="mb-1 block px-1 text-xs text-muted-foreground">
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </label>
      </div>

      <label>
        <span className="mb-1 block px-1 text-xs text-muted-foreground">
          Note
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Add a note"
          className={cn(field, "placeholder:text-muted-foreground/70")}
        />
      </label>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className={cn(
            "flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors duration-(--duration-fast)",
            confirmDelete
              ? "bg-budget-over text-white"
              : "bg-surface-1 text-budget-over",
          )}
        >
          <Trash2 className="size-4" />{" "}
          {confirmDelete ? "Tap to confirm" : "Delete"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || cents <= 0}
          className="flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : "Save"}
        </button>
      </div>
      {row.source !== "manual" && (
        <p className="text-center text-[11px] text-muted-foreground">
          Imported from{" "}
          {row.source === "seed" ? "your statements/history" : row.source}.
          Edits change your balances.
        </p>
      )}
    </div>
  );
}
