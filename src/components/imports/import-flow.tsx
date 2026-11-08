"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { confirmImport, previewImport } from "@/app/actions/imports";
import { formatShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type PreviewOk = Extract<Awaited<ReturnType<typeof previewImport>>, { ok: true }>;
type Row = PreviewOk["preview"]["rows"][number];

const STATUS: Record<Row["status"], { label: string; tone: string }> = {
  new: { label: "New", tone: "text-money-in" },
  duplicate: { label: "Already saved", tone: "text-muted-foreground" },
  imported: { label: "Imported before", tone: "text-muted-foreground" },
  possible: { label: "Possible duplicate", tone: "text-budget-high" },
};

/** Upload a statement PDF → review every row → import (§4.3). Nothing is saved before Confirm. */
export function ImportFlow() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<PreviewOk | null>(null);
  const [include, setInclude] = useState<boolean[]>([]);
  const [cats, setCats] = useState<(string | null)[]>([]);
  const [dragging, setDragging] = useState(false);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  const read = (file: File | undefined) => {
    if (!file) return;
    startReading(async () => {
      const form = new FormData();
      form.set("file", file);
      const res = await previewImport(form);
      if (!res.ok) return void toast.error(res.error);
      setData(res);
      setInclude(res.preview.rows.map((r) => r.status === "new"));
      setCats(res.preview.rows.map((r) => r.categoryId));
    });
  };

  const reset = () => {
    setData(null);
    if (input.current) input.current.value = "";
  };

  if (!data) {
    return (
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          read(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors duration-(--duration-fast) hover:bg-surface-1",
          dragging && "border-lime bg-surface-1",
        )}
      >
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => read(e.target.files?.[0])} />
        <span className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-lime-ink">
          {reading ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
        </span>
        <span className="text-base font-semibold">{reading ? "Reading statement…" : "Upload a statement PDF"}</span>
        <span className="max-w-xs text-sm text-muted-foreground">Scotiabank chequing, Scene+ Visa, Costco CIBC or Triangle. You&apos;ll review every row before anything is saved.</span>
      </label>
    );
  }

  const p = data.preview;
  const allOk = p.checks.every((c) => c.ok);
  const chosen = p.rows.map((r, i) => ({ r, i })).filter(({ i }) => include[i]);
  const counts = p.rows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
  const grouped = data.categories.reduce<Record<string, typeof data.categories>>((g, c) => ((g[c.kind] ??= []).push(c), g), {});

  const commit = () =>
    startSaving(async () => {
      const res = await confirmImport({
        fileName: p.fileName,
        source: p.source,
        accountId: p.account.id,
        rows: chosen.map(({ r, i }) => ({ date: r.date, posted: r.posted, amount_cents: r.amount_cents, description: r.description, fingerprint: r.fingerprint, categoryId: cats[i] })),
        skipped: p.rows.length - chosen.length,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Imported ${res.imported} transactions into ${p.account.name}`);
      reset();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-3xl bg-surface-1 p-5 ring-1 ring-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{p.account.name}</p>
            <p className="mt-1 truncate text-sm">{p.fileName}</p>
          </div>
          <button type="button" onClick={reset} className="grid size-9 place-items-center rounded-xl bg-surface-2" aria-label="Cancel import">
            <X className="size-4" />
          </button>
        </div>
        <ul className="mt-3 flex flex-col gap-1">
          {p.checks.map((c) => (
            <li key={c.name} className={cn("flex items-center gap-2 text-xs", c.ok ? "text-money-in" : "text-budget-over")}>
              {c.ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              {c.name}
              {!c.ok && ` (off by ${formatCents(Math.abs(c.got - c.want))})`}
            </li>
          ))}
        </ul>
        {!allOk && <p className="mt-2 text-xs text-budget-over">The statement doesn&apos;t add up. Some rows may have been missed, so check carefully.</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          {p.rows.length} rows · {counts.new ?? 0} new · {(counts.duplicate ?? 0) + (counts.imported ?? 0)} already saved · {counts.possible ?? 0} to check
        </p>
      </section>

      <div className="divide-y divide-border rounded-2xl bg-surface-1 px-3">
        {p.rows.map((r, i) => (
          <div key={r.fingerprint} className={cn("flex flex-col gap-2 py-3", !include[i] && "opacity-50")}>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={include[i]}
                onChange={(e) => setInclude((xs) => xs.map((x, j) => (j === i ? e.target.checked : x)))}
                className="size-5 shrink-0 accent-[var(--lime)]"
                aria-label={`Import ${r.merchant}`}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{r.merchant || r.description}</span>
                <span className="text-xs text-muted-foreground">
                  {formatShort(r.date)} · <span className={STATUS[r.status].tone}>{STATUS[r.status].label}</span>
                </span>
              </span>
              <span className={cn("num shrink-0 text-sm font-medium", r.amount_cents > 0 && "text-money-in")}>{formatCents(r.amount_cents, { signed: r.amount_cents > 0 })}</span>
            </div>
            {r.match && r.status === "possible" && (
              <p className="ml-8 rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground">
                Matches {formatShort(r.match.date)} · {r.match.note || r.match.description} · {formatCents(r.match.amount_cents)}. Tick it only if it&apos;s a different purchase.
              </p>
            )}
            {include[i] && (
              <select
                value={cats[i] ?? ""}
                onChange={(e) => setCats((xs) => xs.map((x, j) => (j === i ? e.target.value || null : x)))}
                className={cn("ml-8 h-9 rounded-lg bg-surface-2 px-2 text-xs outline-none focus:ring-2 focus:ring-lime", !cats[i] && "text-budget-high")}
                aria-label="Category"
              >
                <option value="">Choose a category…</option>
                {Object.entries(grouped).map(([kind, list]) => (
                  <optgroup key={kind} label={kind}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parent} · {c.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4">
        <button
          type="button"
          onClick={commit}
          disabled={saving || chosen.length === 0}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-on-lime shadow-lg transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-40"
        >
          {saving ? <Loader2 className="size-5 animate-spin" /> : `Import ${chosen.length} transaction${chosen.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
