import Link from "next/link";
import { ChevronRight, CreditCard, TrendingUp } from "lucide-react";
import { AnimatedCents } from "@/components/animated-number";
import { CashCard } from "@/components/cash-card";
import { CategoryChip } from "@/components/category-icon";
import { HomeTile } from "@/components/home-tile";
import { SavingsPromptCard } from "@/components/savings-prompt";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { bandColorVar } from "@/lib/budget";
import { daysBetween, formatDay, formatMonthName, formatShort } from "@/lib/dates";
import { getHome, getSavingsPrompts } from "@/lib/data";
import { formatCents } from "@/lib/money";

/**
 * Home (owner picked the Cash-first layout, Nov 8 2026): Cash hero (emergency
 * fund behind a PIN), this month's spending vs budget → Summary, Debts and
 * Investments, then upcoming bills.
 */
export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-3xl">
      <Reveal fallback={<HomeSkeleton />}>
        <Home />
      </Reveal>
    </div>
  );
}

async function Home() {
  const [h, prompts] = await Promise.all([getHome(), getSavingsPrompts()]);
  const pct = h.budget ? Math.round((h.spent / h.budget) * 100) : 0;
  const left = h.budget - h.spent;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-sm text-muted-foreground">{formatDay(h.today)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {h.greeting}
            {h.name ? `, ${h.name}` : ""}
          </h1>
        </div>
      </header>

      {/* Hero: Cash */}
      <CashCard
        bankTotal={h.cash}
        accounts={h.cashAccounts}
        emergencyInstitution={h.emergencyInstitution}
        owedToMe={h.owedToMe}
        paydayLabel={h.nextPayday ? formatDay(h.nextPayday) : null}
      />

      {prompts.map((p) => (
        <SavingsPromptCard key={p.key} prompt={p} />
      ))}

      {/* Budget → this month's summary */}
      <Link href={`/summary/${h.month}`} className="group block rounded-2xl bg-surface-1 p-4 transition-colors duration-(--duration-fast) hover:bg-surface-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Spent in {formatMonthName(h.month)}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {pct}% <ChevronRight className="size-4" />
          </span>
        </div>
        <p className="mt-1 flex items-baseline gap-1.5">
          <AnimatedCents value={h.spent} whole className="num text-3xl font-semibold tracking-tight" />
          <span className="num text-sm text-muted-foreground">of {formatCents(h.budget, { whole: true })}</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, pct)}%`, background: bandColorVar[h.band] }} />
        </div>
        <p className="num mt-2 text-xs text-muted-foreground">
          {left >= 0 ? `${formatCents(left, { whole: true })} left` : `${formatCents(-left, { whole: true })} over`} · {h.daysLeft} days left
        </p>
      </Link>

      <section className="grid gap-2 md:grid-cols-2">
        <HomeTile
          href="/debts"
          icon={CreditCard}
          label="Debts"
          value={h.debts}
          sub={`${h.debtCounts.cards} cards${h.debtCounts.plans ? ` · ${h.debtCounts.plans} Affirm plans` : ""}`}
        />
        <HomeTile
          href="/investments"
          icon={TrendingUp}
          label="Investments"
          value={h.investments}
          sub={h.investmentCount ? `${h.investmentCount} accounts` : "Add your first account"}
        />
      </section>

      {h.upcoming.length > 0 && (
        <section>
          <div className="mb-1 flex items-center justify-between px-1">
            <h2 className="text-sm font-medium text-muted-foreground">Coming up</h2>
            <Link href="/bills" className="text-xs font-medium text-lime-ink">
              Manage
            </Link>
          </div>
          <div className="rounded-2xl border border-dashed border-border px-4 py-1">
            {h.upcoming.map((u) => {
              const inDays = daysBetween(h.today, u.date);
              return (
                <div key={u.id} className="flex items-center gap-3 py-2.5 opacity-60">
                  <CategoryChip icon={u.icon} color={u.color} size="sm" dashed />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{u.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatShort(u.date)} · {inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `in ${inDays} days`}
                      {u.note ? ` · ${u.note}` : ""}
                    </span>
                  </span>
                  <span className="num text-sm">{formatCents(u.amount_cents)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-7 w-56 rounded-lg" />
      </div>
      <Skeleton className="h-[218px] rounded-3xl" />
      <Skeleton className="h-[134px] rounded-2xl" />
      <div className="grid gap-2 md:grid-cols-2">
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
      </div>
      <Skeleton className="h-[170px] rounded-2xl" />
    </div>
  );
}
