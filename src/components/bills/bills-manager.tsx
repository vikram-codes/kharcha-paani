"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBillAction, dismissAction, loadBills, saveBillAction, setBillActiveAction } from "@/app/actions/planning";
import { CategoryChip } from "@/components/category-icon";
import { MoneyInput, centsToInput, toCents } from "@/components/money-input";
import { ThemedSelect } from "@/components/themed-select";
import { categoryOptions } from "@/components/transactions/transaction-sheet";
import { ResponsiveSheetContent } from "@/components/ui/responsive-sheet";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { daysBetween, formatShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof loadBills>>;
type Bill = Data["bills"][number];
type Draft = {
  id?: string;
  name: string;
  note: string;
  amount: string;
  accountId: string | null;
  categoryId: string | null;
  cadence: "once" | "monthly";
  nextDate: string;
  endDate: string;
  merchantKey?: string | null;
  active?: boolean;
};

const field = "h-11 w-full rounded-xl bg-surface-1 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime";

/** Upcoming bills (§6, §7.7): add, edit, stop, plus "looks like a bill" suggestions. */
export function BillsManager({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, start] = useTransition();
  const reload = async () => setData(await loadBills());

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, close = true) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(msg);
      if (close) setDraft(null);
      await reload();
    });

  const blank = (): Draft => ({ name: "", note: "", amount: "", accountId: null, categoryId: null, cadence: "monthly", nextDate: data.today, endDate: "" });
  const fromBill = (b: Bill): Draft => ({
    id: b.id,
    name: b.name,
    note: b.note ?? "",
    amount: centsToInput(b.amount_cents),
    accountId: b.accountId,
    categoryId: b.categoryId,
    cadence: b.cadence,
    nextDate: b.next ?? b.startDate,
    endDate: b.endDate ?? "",
    merchantKey: b.merchantKey,
    active: b.active,
  });

  const active = data.bills.filter((b) => b.active && b.next).sort((a, b) => (a.next! < b.next! ? -1 : 1));
  const inactive = data.bills.filter((b) => !b.active || !b.next);
  const monthlyTotal = active.filter((b) => b.cadence === "monthly").reduce((t, b) => t - b.amount_cents, 0);
  const accountOptions = data.options.accounts.map((a) => ({ value: a.id, label: a.name, hint: a.last4 ? `••${a.last4}` : undefined }));
  const catOptions = categoryOptions(data.options);

  const row = (b: Bill) => {
    const inDays = b.next ? daysBetween(data.today, b.next) : null;
    return (
      <button key={b.id} type="button" onClick={() => setDraft(fromBill(b))} className={cn("flex w-full items-center gap-3 py-3 text-left", !b.active && "opacity-50")}>
        <CategoryChip icon={b.category?.icon} color={b.category?.color} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{b.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {b.cadence === "monthly" ? "Monthly" : "Once"}
            {b.next ? ` · ${formatShort(b.next)}${inDays === 0 ? " (today)" : inDays === 1 ? " (tomorrow)" : ""}` : b.active ? " · ended" : " · stopped"}
            {b.account ? ` · ${b.account.replace(/^Scotiabank\s+/, "").replace(/\s+Mastercard$/, "")}` : ""}
          </span>
        </span>
        <span className="num text-sm font-medium">{formatCents(b.amount_cents)}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="num text-sm text-muted-foreground">{formatCents(monthlyTotal)} a month in monthly bills</p>
        </div>
        <button type="button" onClick={() => setDraft(blank())} className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-on-lime">
          <Plus className="size-4" /> Add bill
        </button>
      </header>

      {data.suggestions.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-lime-ink" /> Looks like a bill
          </h2>
          <div className="flex flex-col gap-2">
            {data.suggestions.map((s) => (
              <div key={s.key} className="rounded-2xl border border-dashed border-border p-3">
                <div className="flex items-center gap-3">
                  <CategoryChip icon={s.category?.icon} color={s.category?.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.merchant}</span>
                  <span className="num shrink-0 text-sm">{formatCents(s.amount_cents)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 pl-11">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    Charged {s.occurrences}× monthly · next ~{formatShort(s.next_date)}
                  </span>
                  <button type="button" disabled={busy} onClick={() => act(() => dismissAction(`bill:${s.key}`), "Won't suggest it again", false)} className="shrink-0 px-1 text-xs text-muted-foreground">
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...blank(), name: s.merchant, amount: centsToInput(s.amount_cents), accountId: s.account_id, categoryId: s.category_id, nextDate: s.next_date, merchantKey: s.key })
                    }
                    className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium"
                  >
                    Add as bill
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 px-1 text-sm font-medium text-muted-foreground">Upcoming</h2>
        <div className="divide-y divide-border rounded-2xl bg-surface-1 px-3">
          {active.length ? active.map(row) : <p className="py-4 text-sm text-muted-foreground">No upcoming bills.</p>}
        </div>
      </section>

      {inactive.length > 0 && (
        <section>
          <h2 className="mb-1 px-1 text-sm font-medium text-muted-foreground">Stopped or ended</h2>
          <div className="divide-y divide-border rounded-2xl bg-surface-1/60 px-3">{inactive.map(row)}</div>
        </section>
      )}

      <Sheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <ResponsiveSheetContent>
          {draft && (
            <BillForm
              key={draft.id ?? draft.merchantKey ?? "new"}
              draft={draft}
              busy={busy}
              accountOptions={accountOptions}
              catOptions={catOptions}
              onSave={(d) => {
                const cents = toCents(d.amount);
                if (!cents) return void toast.error("Enter an amount.");
                act(
                  () =>
                    saveBillAction({
                      id: d.id,
                      name: d.name,
                      note: d.note,
                      amountCents: cents,
                      accountId: d.accountId,
                      categoryId: d.categoryId,
                      cadence: d.cadence,
                      nextDate: d.nextDate,
                      endDate: d.endDate || null,
                      merchantKey: d.merchantKey ?? null,
                    }),
                  d.id ? "Bill saved" : "Bill added",
                );
              }}
              onToggle={(d) => act(() => setBillActiveAction(d.id!, !d.active), d.active ? "Bill stopped" : "Bill resumed")}
              onDelete={(d) => act(() => deleteBillAction(d.id!), "Bill deleted")}
            />
          )}
        </ResponsiveSheetContent>
      </Sheet>
    </div>
  );
}

function BillForm({
  draft,
  busy,
  accountOptions,
  catOptions,
  onSave,
  onToggle,
  onDelete,
}: {
  draft: Draft;
  busy: boolean;
  accountOptions: { value: string; label: string; hint?: string }[];
  catOptions: ReturnType<typeof categoryOptions>;
  onSave: (d: Draft) => void;
  onToggle: (d: Draft) => void;
  onDelete: (d: Draft) => void;
}) {
  const [d, setD] = useState(draft);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  return (
    <div className="flex flex-col gap-3 px-5 pt-2 pb-5 md:pt-5">
      <div>
        <SheetTitle className="text-lg font-semibold">{d.id ? "Edit bill" : "New bill"}</SheetTitle>
        <SheetDescription className="text-xs">Shows greyed in Coming up until it&apos;s paid.</SheetDescription>
      </div>
      <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Name (e.g. Rogers)" maxLength={60} className={field} aria-label="Name" />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <MoneyInput value={d.amount} onChange={(v) => set("amount", v)} ariaLabel="Amount" />
        <div className="flex rounded-xl bg-surface-1 p-1 text-xs font-medium ring-1 ring-border">
          {(["monthly", "once"] as const).map((c) => (
            <button key={c} type="button" onClick={() => set("cadence", c)} className={cn("rounded-lg px-3", d.cadence === c ? "bg-surface-3 text-foreground" : "text-muted-foreground")}>
              {c === "monthly" ? "Monthly" : "Once"}
            </button>
          ))}
        </div>
      </div>
      <ThemedSelect ariaLabel="Paid from" prefix="From" value={d.accountId} onChange={(v) => set("accountId", v)} options={accountOptions} placeholder="Paid from…" />
      <ThemedSelect ariaLabel="Category" value={d.categoryId} onChange={(v) => set("categoryId", v)} options={catOptions} placeholder="Category…" />
      <div className={cn("grid gap-2", d.cadence === "monthly" ? "grid-cols-2" : "grid-cols-1")}>
        <label>
          <span className="mb-1 block px-1 text-xs text-muted-foreground">{d.cadence === "monthly" ? "Next due" : "Due"}</span>
          <input type="date" value={d.nextDate} onChange={(e) => set("nextDate", e.target.value)} className={field} />
        </label>
        {d.cadence === "monthly" && (
          <label>
            <span className="mb-1 block px-1 text-xs text-muted-foreground">Last payment (optional)</span>
            <input type="date" value={d.endDate} onChange={(e) => set("endDate", e.target.value)} className={field} />
          </label>
        )}
      </div>
      <input value={d.note} onChange={(e) => set("note", e.target.value)} placeholder="Note (optional)" maxLength={80} className={cn(field, "placeholder:text-muted-foreground/70")} />

      <button
        type="button"
        onClick={() => onSave(d)}
        disabled={busy || !d.name.trim() || !d.amount}
        className="flex h-12 items-center justify-center rounded-xl bg-lime font-semibold text-on-lime disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : d.id ? "Save bill" : "Add bill"}
      </button>
      {d.id && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => onToggle(d)} className="h-11 rounded-xl bg-surface-1 text-sm font-medium">
            {d.active ? "Stop bill" : "Resume bill"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => (confirmDelete ? onDelete(d) : setConfirmDelete(true))}
            className={cn("flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium", confirmDelete ? "bg-budget-over text-white" : "bg-surface-1 text-budget-over")}
          >
            <Trash2 className="size-4" /> {confirmDelete ? "Tap to confirm" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}
