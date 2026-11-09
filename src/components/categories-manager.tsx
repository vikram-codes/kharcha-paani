"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { addCategoryAction, archiveCategoryAction, deleteRuleAction, loadCategories, renameCategoryAction } from "@/app/actions/categories";
import { BackButton } from "@/components/back-button";
import { CategoryChip } from "@/components/category-icon";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof loadCategories>>;

const KIND: Record<string, string> = { expense: "Spending", income: "Income", transfer: "Transfers", reimbursement: "Paid back", adjustment: "Adjustments" };
const input = "h-9 min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-lime";

/** Settings → Categories & rules: rename / add / archive categories; see and delete "always" rules. */
export function CategoriesManager({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState<{ parentId: string; name: string; essential: "fixed" | "variable" | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, start] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(msg);
      setEditing(null);
      setAdding(null);
      setData(await loadCategories());
    });

  const kinds = [...new Set(data.groups.map((g) => g.kind))];

  return (
    <div className="flex flex-col gap-5">
      <BackButton fallback="/settings" />
      <header className="-mt-3 px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories &amp; rules</h1>
        <p className="text-sm text-muted-foreground">Rename, add or archive categories. Archived ones keep their history but disappear from pickers.</p>
      </header>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Rules · {data.rules.length}</h2>
        <div className="divide-y divide-border rounded-2xl bg-surface-1 px-4">
          {data.rules.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No rules yet. When you change a transaction&apos;s category, tick &quot;Always put … in this category&quot;.</p>
          )}
          {data.rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="capitalize">{r.merchant}</span> <span className="text-muted-foreground">→</span> {r.category}
              </span>
              <button type="button" disabled={busy} onClick={() => act(() => deleteRuleAction(r.id), "Rule deleted")} aria-label="Delete rule" className="text-muted-foreground hover:text-budget-over">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[var(--lime)]" />
        Show archived categories
      </label>

      {kinds.map((kind) => (
        <section key={kind}>
          <h2 className="mb-2 px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">{KIND[kind] ?? kind}</h2>
          <div className="flex flex-col gap-2">
            {data.groups
              .filter((g) => g.kind === kind)
              .map((g) => (
                <div key={g.id} className="rounded-2xl bg-surface-1 p-3">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold">{g.name}</span>
                    <button
                      type="button"
                      onClick={() => setAdding({ parentId: g.id, name: "", essential: null })}
                      className="flex items-center gap-1 text-xs font-medium text-lime-ink"
                    >
                      <Plus className="size-3" /> Add
                    </button>
                  </div>
                  {g.children
                    .filter((c) => showArchived || !c.archived)
                    .map((c) => (
                      <div key={c.id} className={cn("flex items-center gap-2.5 py-1.5", c.archived && "opacity-50")}>
                        <CategoryChip icon={c.icon} color={c.color} size="sm" />
                        {editing?.id === c.id ? (
                          <>
                            <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} maxLength={50} aria-label="Category name" />
                            <button type="button" disabled={busy} onClick={() => act(() => renameCategoryAction(c.id, editing.name), "Renamed")} aria-label="Save name" className="text-money-in">
                              <Check className="size-4" />
                            </button>
                            <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="text-muted-foreground">
                              <X className="size-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {c.name}
                              {c.essential && <span className="ml-1.5 text-[11px] text-muted-foreground">{c.essential === "fixed" ? "Fixed" : "Essential"}</span>}
                            </span>
                            <span className="num text-[11px] text-muted-foreground">{c.uses}</span>
                            <button type="button" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`} className="text-muted-foreground hover:text-foreground">
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => act(() => archiveCategoryAction(c.id, !c.archived), c.archived ? "Restored" : "Archived")}
                              aria-label={c.archived ? `Restore ${c.name}` : `Archive ${c.name}`}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {c.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  {adding?.parentId === g.id && (
                    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-surface-2/60 p-2">
                      <div className="flex items-center gap-2">
                        <input autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder={`New ${g.name} category`} className={input} maxLength={50} aria-label="New category name" />
                        <button type="button" onClick={() => setAdding(null)} aria-label="Cancel" className="text-muted-foreground">
                          <X className="size-4" />
                        </button>
                      </div>
                      {kind === "expense" && (
                        <div className="flex gap-1.5 text-xs">
                          {([null, "variable", "fixed"] as const).map((e) => (
                            <button
                              key={String(e)}
                              type="button"
                              onClick={() => setAdding({ ...adding, essential: e })}
                              className={cn("rounded-full px-2.5 py-1", adding.essential === e ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground")}
                            >
                              {e === null ? "Discretionary" : e === "fixed" ? "Essential fixed" : "Essential variable"}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={busy || !adding.name.trim()}
                        onClick={() => act(() => addCategoryAction(g.id, adding.name, adding.essential), "Category added")}
                        className="h-9 rounded-lg bg-lime text-sm font-semibold text-on-lime disabled:opacity-40"
                      >
                        Add category
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
