"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HandCoins, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { notifyDataChanged } from "@/lib/data-events";
import { addOwedAction, deleteOwedAction, loadOwed, settleOwedAction, unsettleOwedAction } from "@/app/actions/editing";
import { MoneyInput, toCents } from "@/components/money-input";
import { formatShort } from "@/lib/dates";
import { cleanMerchant } from "@/lib/merchant";
import { formatCents } from "@/lib/money";

type Owed = Awaited<ReturnType<typeof loadOwed>>;

/** Money friends owe you (§6): add, mark paid back, remove. Never counted in Cash. */
export function OwedPanel() {
  const router = useRouter();
  const [data, setData] = useState<Owed | null>(null);
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  /** Which row is waiting for the second tap ("received" / "remove"). */
  const [confirm, setConfirm] = useState<{ id: string; what: "received" | "remove" } | null>(null);

  const reload = () => loadOwed().then(setData);
  useEffect(() => {
    loadOwed().then(setData);
  }, []);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(msg);
      await reload();
      notifyDataChanged();
      router.refresh();
    });

  const total = data?.open.reduce((t, o) => t + o.amount_cents, 0) ?? 0;
  const cents = toCents(amount);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-muted-foreground">
          Owed to you{total > 0 && <span className="num"> · {formatCents(total)}</span>}
        </h2>
        <button type="button" onClick={() => setAdding((a) => !a)} className="flex items-center gap-1 rounded-full bg-surface-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Plus className="size-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="mb-2 flex flex-col gap-2 rounded-2xl bg-surface-1 p-3">
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Who?" maxLength={60} className="h-11 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime" />
            <MoneyInput value={amount} onChange={setAmount} className="bg-surface-2" ariaLabel="Amount owed" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What for? (optional)" maxLength={200} className="h-11 rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime" />
          <button
            type="button"
            disabled={busy || !person.trim() || !cents}
            onClick={() =>
              act(async () => {
                const r = await addOwedAction({ person, amountCents: cents!, note });
                if (r.ok) {
                  setPerson("");
                  setAmount("");
                  setNote("");
                  setAdding(false);
                }
                return r;
              }, "Added")
            }
            className="flex h-11 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-on-lime disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </button>
        </div>
      )}

      <div className="divide-y divide-border rounded-2xl bg-surface-1/60 px-4">
        {!data && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
        {data && data.open.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nobody owes you anything right now.</p>}
        {data?.open.map((o) => (
          <div key={o.id} className="flex items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground">
              <HandCoins className="size-[18px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{o.person}</span>
              <span className="truncate text-xs text-muted-foreground">
                {o.transaction ? `${formatShort(o.transaction.date)} · ${cleanMerchant(o.transaction.description)}` : (o.note ?? "No details")}
              </span>
            </span>
            <span className="num text-sm text-muted-foreground">{formatCents(o.amount_cents)}</span>
            {confirm?.id === o.id && confirm.what === "received" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirm(null);
                  act(() => settleOwedAction(o.id), `Marked ${formatCents(o.amount_cents)} from ${o.person} as received`);
                }}
                className="flex items-center gap-1 rounded-full bg-money-in px-2.5 py-1.5 text-xs font-semibold text-background"
              >
                <Check className="size-3" /> Confirm
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm({ id: o.id, what: "received" })}
                className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-money-in"
              >
                <Check className="size-3" /> Mark received
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm?.id === o.id && confirm.what === "remove") {
                  setConfirm(null);
                  act(() => deleteOwedAction(o.id), "Removed");
                } else setConfirm({ id: o.id, what: "remove" });
              }}
              aria-label={confirm?.id === o.id && confirm.what === "remove" ? "Tap again to remove" : "Remove"}
              className={confirm?.id === o.id && confirm.what === "remove" ? "text-budget-over" : "text-muted-foreground hover:text-budget-over"}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      {data && data.settled.length > 0 && (
        <div className="mt-2 px-1">
          <p className="mb-1 text-xs text-muted-foreground">Received recently</p>
          <div className="flex flex-wrap gap-1.5">
            {data.settled.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 rounded-full bg-surface-1 py-1 pr-1 pl-2.5 text-xs text-muted-foreground">
                {s.person} {formatCents(s.amount_cents, { whole: true })}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => unsettleOwedAction(s.id), `${s.person} owes you again`)}
                  className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-foreground"
                >
                  Undo
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">Not counted in Cash until it&apos;s paid back. When it arrives as an e-Transfer it&apos;s a payback, not income.</p>
    </section>
  );
}
