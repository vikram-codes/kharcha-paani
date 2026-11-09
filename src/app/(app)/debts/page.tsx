import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronRight, CreditCard, GraduationCap } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Skeleton } from "@/components/ui/skeleton";
import { UpdateBalance } from "@/components/update-balance";
import { bandColorVar, budgetBand } from "@/lib/budget";
import { getDebts } from "@/lib/data";
import { formatShort } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Debts" };

export default function DebtsPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-3xl">
      <BackButton fallback="/" className="-mb-3" />
      <Suspense fallback={<DebtsSkeleton />}>
        <Debts />
      </Suspense>
    </div>
  );
}

async function Debts() {
  const d = await getDebts();
  return (
    <>
      <header>
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Debts</p>
        <p className="num mt-1 text-[40px] leading-none font-semibold tracking-tight">{formatCents(d.total)}</p>
        <p className="mt-2 text-sm text-muted-foreground">Credit cards and Affirm. The student loan is tracked separately.</p>
      </header>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Credit cards</h2>
        <div className="flex flex-col gap-2">
          {d.cards.map((c) => {
            const used = c.limit ? Math.round((c.owed / c.limit) * 100) : null;
            return (
              <div key={c.account_id} className="rounded-2xl bg-surface-1 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
                    <CreditCard className="size-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.last4 ? `•••• ${c.last4}` : c.institution}
                      {c.apr ? ` · ${c.apr}% APR` : ""}
                    </span>
                  </span>
                  <UpdateBalance
                    accountId={c.account_id}
                    name={c.name}
                    current={c.owed}
                    debt
                    trigger={
                      <button type="button" className="flex flex-col items-end" aria-label={`Update ${c.name} balance`}>
                        <span className="num text-lg font-semibold">{formatCents(c.owed)}</span>
                        <span className="text-[11px] text-lime-ink">Update</span>
                      </button>
                    }
                  />
                </div>
                {c.reported && c.reported.owed - c.owed > 50 && (
                  <div className="mt-3 rounded-xl bg-budget-high/10 px-3 py-2 text-xs">
                    <p className="font-medium text-budget-high">
                      Still to add: <span className="num">{formatCents(c.reported.owed - c.owed)}</span>
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      Your bank showed <span className="num">{formatCents(c.reported.owed)}</span> on {formatShort(c.reported.on)}. Add the purchases since the last statement and this reaches $0.
                    </p>
                  </div>
                )}
                {c.limit != null && used != null && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, used)}%`, background: bandColorVar[budgetBand(c.owed, c.limit)] }}
                      />
                    </div>
                    <p className="num mt-1.5 text-[11px] text-muted-foreground">
                      {used}% of {formatCents(c.limit, { whole: true })} limit
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {d.plans.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Pay-later plans</h2>
          <div className="divide-y divide-border rounded-2xl bg-surface-1 px-4">
            {d.plans.map((p) => (
              <div key={p.account_id} className="flex items-center gap-3 py-3">
                <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
                  <CalendarClock className="size-[18px]" />
                </span>
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <UpdateBalance
                  accountId={p.account_id}
                  name={p.name}
                  current={p.owed}
                  debt
                  trigger={
                    <button type="button" className="flex flex-col items-end" aria-label={`Update ${p.name} balance`}>
                      <span className="num text-sm font-semibold">{p.owed === 0 ? "Paid off" : formatCents(p.owed)}</span>
                      <span className="text-[11px] text-lime-ink">Update</span>
                    </button>
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {d.loanOwed != null && (
        <Link
          href="/debts/student-loan"
          className="group flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 transition-colors duration-(--duration-fast) hover:bg-surface-1"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
            <GraduationCap className="size-[18px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">Student loan</span>
            <span className="text-xs text-muted-foreground">Tracked separately</span>
          </span>
          <span className="num text-sm font-semibold">{formatCents(d.loanOwed, { whole: true })}</span>
          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-(--duration-fast) group-hover:translate-x-0.5" />
        </Link>
      )}
    </>
  );
}

function DebtsSkeleton() {
  return (
    <>
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
    </>
  );
}
