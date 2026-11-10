"use client";

import { Plus } from "lucide-react";
import type { Upcoming } from "@/lib/data";
import { QuickAddSheet } from "@/components/shell/quick-add-sheet";

/**
 * "Add" on a bill due today/tomorrow (or overdue): opens quick-add with the
 * bill filled in. Once saved, the bill counts as added and moves on.
 */
export function AddBillBadge({ bill }: { bill: Upcoming }) {
  return (
    <QuickAddSheet
      prefill={{
        label: bill.name,
        cents: bill.amount_cents,
        categoryId: bill.categoryId,
        accountId: bill.accountId,
        paysAccountId: bill.paysAccountId,
        date: bill.date,
      }}
      trigger={
        <button
          type="button"
          aria-label={`Add ${bill.name}`}
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-lime py-1 pr-2.5 pl-2 text-[11px] font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-95"
        >
          <Plus className="size-3" strokeWidth={3} />
          Add
        </button>
      }
    />
  );
}
