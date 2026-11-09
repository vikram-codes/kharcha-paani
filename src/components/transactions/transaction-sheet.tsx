"use client";

import { useEffect, useState, useTransition } from "react";
import { HandCoins, Loader2, Split, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  loadEditOptions,
  removeTransaction,
  saveTransaction,
} from "@/app/actions/activity";
import { makeRuleAction, removeSplitsAction, saveSplitsAction } from "@/app/actions/categories";
import { addOwedAction } from "@/app/actions/editing";
import { CategoryChip } from "@/components/category-icon";
import { MoneyInput, centsToInput, toCents } from "@/components/money-input";
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
  const [splitting, setSplitting] = useState(false);
  const [makeRule, setMakeRule] = useState(false);
  const [applyPast, setApplyPast] = useState(false);
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
      if (makeRule && categoryId && categoryId !== (row.category?.id ?? "")) {
        const r = await makeRuleAction(row.description, categoryId, applyPast);
        if (!r.ok) toast.error(r.error);
        else toast.success(`Saved · rule added${r.count ? ` · ${r.count} past transaction${r.count === 1 ? "" : "s"} updated` : ""}`);
      } else toast.success("Saved");
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

      {/* Category, or split across categories */}
      {splitting || row.splits.length > 0 ? (
        <SplitEditor
          row={row}
          options={categoryOptions(opts)}
          total={cents}
          onDone={() => {
            onChanged();
            onClose();
          }}
          onCancel={row.splits.length ? onClose : () => setSplitting(false)}
        />
      ) : (
        <div>
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">Category</span>
            {row.amount_cents !== 0 && !row.isTransfer && (
              <button type="button" onClick={() => setSplitting(true)} className="flex items-center gap-1 text-xs font-medium text-lime-ink">
                <Split className="size-3" /> Split
              </button>
            )}
          </div>
          <ThemedSelect
            ariaLabel="Category"
            value={categoryId || null}
            onChange={(v) => setCategoryId(v ?? "")}
            disabled={!opts}
            placeholder="Uncategorized"
            options={categoryOptions(opts)}
          />
          {categoryId && categoryId !== (row.category?.id ?? "") && (
            <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-surface-1 p-3 text-xs">
              <Toggle checked={makeRule} onChange={setMakeRule}>
                Always put <span className="font-medium text-foreground">{rowTitle(row)}</span> in this category
              </Toggle>
              {makeRule && (
                <Toggle checked={applyPast} onChange={setApplyPast}>
                  Also change past {rowTitle(row)} transactions
                </Toggle>
              )}
            </div>
          )}
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

      {row.amount_cents < 0 && !row.isTransfer && row.splits.length === 0 && (
        <FriendOwes row={row} onChanged={onChanged} />
      )}

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

/** "A friend owes me part of this": that part leaves your spending and goes on your Owed list. */
function FriendOwes({ row, onChanged }: { row: ActivityRow; onChanged: () => void }) {
  const total = Math.abs(row.amount_cents);
  const owedSoFar = row.owed.reduce((t, o) => t + o.amount_cents, 0);
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState(centsToInput(Math.round((total - owedSoFar) / 2)));
  const [busy, start] = useTransition();
  const cents = toCents(amount);

  const add = () =>
    cents &&
    start(async () => {
      const res = await addOwedAction({ person, amountCents: cents, transactionId: row.id });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${person} owes you ${formatCents(cents)}`);
      setOpen(false);
      setPerson("");
      onChanged();
    });

  return (
    <div className="rounded-xl bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          <HandCoins className="size-4 text-muted-foreground" />
          {row.owed.length ? (
            <span>
              {row.owed.map((o) => `${o.person} ${formatCents(o.amount_cents)}${o.settled ? " ✓" : ""}`).join(" · ")}
              <span className="block text-[11px] text-muted-foreground">Your share: {formatCents(total - owedSoFar)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Did someone owe you part of this?</span>
          )}
        </span>
        {!open && owedSoFar < total && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium">
            Friend owes me
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_7.5rem] gap-2">
            <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Who?" maxLength={60} className="h-11 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime" />
            <MoneyInput value={amount} onChange={setAmount} className="bg-surface-2" ariaLabel="Amount they owe" />
          </div>
          <div className="flex gap-1.5 text-xs">
            {[0.5, 1 / 3, 0.25].map((f) => (
              <button key={f} type="button" onClick={() => setAmount(centsToInput(Math.round(total * f)))} className="rounded-full bg-surface-2 px-2.5 py-1 text-muted-foreground">
                {f === 0.5 ? "Half" : f === 0.25 ? "Quarter" : "Third"}
              </button>
            ))}
          </div>
          <button type="button" disabled={busy || !person.trim() || !cents} onClick={add} className="flex h-10 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-on-lime disabled:opacity-40">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Add to Owed to you"}
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-muted-foreground">
      <span className="relative grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer size-5 cursor-pointer appearance-none rounded-md bg-surface-2 ring-1 ring-border checked:bg-lime checked:ring-lime"
        />
        <svg viewBox="0 0 16 16" className="pointer-events-none absolute size-3.5 text-on-lime opacity-0 peer-checked:opacity-100" aria-hidden>
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}

/** Split one transaction across categories (§6). Lines must add up to the total exactly. */
function SplitEditor({
  row,
  options,
  total,
  onDone,
  onCancel,
}: {
  row: ActivityRow;
  options: SelectOption[];
  total: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const initial =
    row.splits.length > 0
      ? row.splits.map((s) => ({ categoryId: s.categoryId, amount: centsToInput(s.amount_cents) }))
      : [
          { categoryId: row.category?.id ?? null, amount: centsToInput(total) },
          { categoryId: null as string | null, amount: "" },
        ];
  const [lines, setLines] = useState(initial);
  const [busy, start] = useTransition();
  const sum = lines.reduce((t, l) => t + (toCents(l.amount) ?? 0), 0);
  const left = total - sum;
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Typing into a line takes the difference from the first line, so it always adds up.
  const setAmount = (i: number, v: string) =>
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, amount: v } : l));
      if (i !== 0) {
        const others = next.slice(1).reduce((t, l) => t + (toCents(l.amount) ?? 0), 0);
        next[0] = { ...next[0], amount: centsToInput(Math.max(0, total - others)) };
      }
      return next;
    });

  const save = () =>
    start(async () => {
      const res = await saveSplitsAction(
        row.id,
        lines.map((l) => ({ categoryId: l.categoryId ?? "", cents: toCents(l.amount) ?? 0 })),
      );
      if (!res.ok) return void toast.error(res.error);
      toast.success("Split saved");
      onDone();
    });

  const unsplit = () =>
    start(async () => {
      const res = await removeSplitsAction(row.id, lines[0]?.categoryId ?? null);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Split removed");
      onDone();
    });

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-1 p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Split className="size-3" /> Split {formatCents(total)} across categories
      </p>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
          <ThemedSelect size="sm" ariaLabel={`Line ${i + 1} category`} value={l.categoryId} onChange={(v) => set(i, { categoryId: v })} options={options} placeholder="Category…" warn />
          <MoneyInput value={l.amount} onChange={(v) => setAmount(i, v)} className="h-9 bg-surface-2" ariaLabel={`Line ${i + 1} amount`} />
        </div>
      ))}
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={() => setLines((ls) => [...ls, { categoryId: null, amount: "" }])} className="font-medium text-lime-ink">
          + Add line
        </button>
        <span className={cn("num", left === 0 ? "text-money-in" : "text-budget-high")}>{left === 0 ? "Adds up ✓" : `${formatCents(Math.abs(left))} ${left > 0 ? "left" : "over"}`}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={row.splits.length ? unsplit : onCancel} disabled={busy} className="h-10 rounded-xl bg-surface-2 text-sm">
          {row.splits.length ? "Remove split" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || left !== 0 || lines.some((l) => !l.categoryId)}
          className="flex h-10 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-on-lime disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save split"}
        </button>
      </div>
    </div>
  );
}
