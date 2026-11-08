import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CreditCard, Lock, TrendingUp } from "lucide-react";
import { AnimatedCents } from "@/components/animated-number";
import { CategoryChip } from "@/components/category-icon";
import { HomeTile } from "@/components/home-tile";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { bandColorVar } from "@/lib/budget";
import { daysBetween, formatDay, formatMonthName, formatShort } from "@/lib/dates";
import { getHome } from "@/lib/data";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Home (Cash-first mockup)" };

/** MOCKUP: Home with Cash as the hero and the month's budget as the first card below. */
export default function HomeCashMockup() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-3xl">
      <div className="flex items-center justify-between rounded-full bg-surface-1 px-4 py-2 text-xs">
        <span className="text-muted-foreground">Mockup · Cash-first Home</span>
        <Link href="/" className="font-medium text-lime-ink">
          Compare with current →
        </Link>
      </div>
      <Reveal fallback={<Skeleton className="h-[600px] rounded-3xl" />}>
        <Home />
      </Reveal>
    </div>
  );
}

async function Home() {
  const h = await getHome();
  const pct = h.budget ? Math.round((h.spent / h.budget) * 100) : 0;
  const left = h.budget - h.spent;

  return (
    <div className="flex flex-col gap-5">
      <header className="px-1">
        <p className="text-sm text-muted-foreground">{formatDay(h.today)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {h.greeting}
          {h.name ? `, ${h.name}` : ""}
        </h1>
      </header>

      {/* Hero: Cash */}
      <Link href="/cash" className="group block rounded-3xl bg-surface-1 p-5 ring-1 ring-border transition-transform duration-(--duration-fast) active:scale-[0.99]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Cash</p>
          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-(--duration-fast) group-hover:translate-x-0.5" />
        </div>
        <AnimatedCents value={h.cash} className="num mt-2 block text-[44px] leading-none font-semibold tracking-tight" />
        <div className="mt-4 flex flex-wrap gap-2">
          {h.cashAccounts.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{a.emergency ? "Emergency" : a.name.replace(/^Scotiabank\s+/, "")}</span>
              {a.cents == null ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Lock className="size-3" />
                  ••••
                </span>
              ) : (
                <span className="num font-medium">{formatCents(a.cents, { whole: true })}</span>
              )}
            </span>
          ))}
        </div>
        <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground">
          <span className="text-muted-foreground/70">{h.owedToMe ? `${formatCents(h.owedToMe, { whole: true })} owed to you` : ""}</span>
          {h.nextPayday && (
            <span>
              Payday <span className="text-foreground">{formatDay(h.nextPayday)}</span>
            </span>
          )}
        </div>
      </Link>

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
          <h2 className="mb-1 px-1 text-sm font-medium text-muted-foreground">Coming up</h2>
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
