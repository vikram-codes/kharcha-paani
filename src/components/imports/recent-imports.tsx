"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { notifyDataChanged } from "@/lib/data-events";
import { undoImportAction } from "@/app/actions/imports";

type Imp = { id: string; file_name: string | null; imported_count: number; skipped_count: number; status: string; created_at: string };

export function RecentImports({ imports }: { imports: Imp[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  if (!imports.length) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Recent imports</h2>
      <div className="divide-y divide-border rounded-2xl bg-surface-1 px-4">
        {imports.map((i) => (
          <div key={i.id} className="flex items-center gap-3 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{i.file_name}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(i.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} · {i.imported_count} added · {i.skipped_count} skipped
              </span>
            </span>
            {i.status === "committed" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const res = await undoImportAction(i.id);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success("Import undone");
                    notifyDataChanged();
                    router.refresh();
                  })
                }
                className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-budget-over"
              >
                Undo
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">Undone</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
