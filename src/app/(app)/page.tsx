import Link from "next/link";
import { ChevronRight, CreditCard, TrendingUp, Wallet } from "lucide-react";
import { CategoryChip } from "@/components/category-icon";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { bandColorVar } from "@/lib/budget";
import { daysBetween, formatDay, formatMonthName, formatShort } from "@/lib/dates";
import { getHome } from "@/lib/data";
import { formatCents } from "@/lib/money";

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
  const h = await getHome();
  const pct = h.budget ? Math.round((h.spent / h.budget) * 100) : null;
  const color = bandColorVar[h.band];

  return (
    <div className="flex flex-col gap-5">
      {/* Hero: total spent this month → Summary */}
      <Link
        href={`/summary/${h.month}`}
        className="group block rounded-3xl bg-surface-1 p-5 ring-1 ring-border transition-transform duration-(--duration-fast) active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Spent in {formatMonthName(h.month)}
          </p>
          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-(--duration-fast) group-hover:translate-x-0.5" />
        </div>
        <p className="num mt-2 text-[44px] leading-none font-semibold tracking-tight">
          {formatCents(h.spent, { whole: true })}
        </p>
        {h.budget > 0 && (
          <>
            <p className="num mt-2 text-sm text-muted-foreground">
              of {formatCents(h.budget, { whole: true })} budget · {pct}%
              {h.spent <= h.budget && <> · {formatCents(h.budget - h.spent, { whole: true })} left</>}
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, background: color }} />
            </div>
          </>
        )}
        <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground">
          <span>
            {h.daysLeft} {h.daysLeft === 1 ? "day" : "days"} left
          </span>
          {h.nextPayday && (
            <span>
              Payday <span className="text-foreground">{formatDay(h.nextPayday)}</span>
            </span>
          )}
        </div>
      </Link>

      {/* Balances */}
      <section className="grid gap-2 md:grid-cols-3">
        <Tile href="/cash" icon={Wallet} label="Cash" value={h.cash} sub="Chequing · Savings · Emergency ••••"
          extra={h.owedToMe ? `+${formatCents(h.owedToMe, { whole: true })} owed to you` : undefined}
        />
        <Tile
          href="/debts"
          icon={CreditCard}
          label="Debts"
          value={h.debts}
          sub={`${h.debtCounts.cards} cards${h.debtCounts.plans ? ` · ${h.debtCounts.plans} Affirm plans` : ""}`}
        />
        <Tile
          href="/investments"
          icon={TrendingUp}
          label="Investments"
          value={h.investments}
          sub={h.investmentCount ? `${h.investmentCount} accounts` : "Add your first account"}
        />
      </section>

      {/* Coming up */}
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

function Tile({
  href,
  icon: Icon,
  label,
  value,
  sub,
  extra,
}: {
  href: string;
  icon: typeof Wallet;
  label: string;
  value: number;
  sub: string;
  extra?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-4 rounded-2xl bg-surface-1 p-4 transition-colors duration-(--duration-fast) hover:bg-surface-2 active:scale-[0.99]"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-lime-ink group-hover:bg-surface-3">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="num text-2xl font-semibold tracking-tight">{formatCents(value)}</span>
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
        {extra && <span className="num mt-0.5 truncate text-xs text-money-in">{extra}</span>}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-[188px] rounded-3xl" />
      <div className="grid gap-2 md:grid-cols-3">
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
      </div>
      <Skeleton className="h-[170px] rounded-2xl" />
    </div>
  );
}
