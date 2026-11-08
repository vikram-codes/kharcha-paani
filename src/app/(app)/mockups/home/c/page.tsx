import { ArrowUpRight } from "lucide-react";
import { Donut, MockupSwitcher, bandColor, left, mock, money, usedPct } from "../_shared";

/** C — "The card": one dense hero card, balances as a ledger list, bills as a timeline. */
export default function HomeMockupC() {
  return (
    <div className="mx-auto max-w-md">
      <MockupSwitcher current="c" />

      <section className="relative overflow-hidden rounded-3xl bg-lime p-5 text-on-lime">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium tracking-wider uppercase opacity-70">{mock.month} · left to spend</p>
            <p className="num mt-2 text-[44px] leading-none font-bold tracking-tight">{money(left)}</p>
            <p className="num mt-2 text-sm opacity-70">
              {money(mock.spent)} spent of {money(mock.pool)}
            </p>
          </div>
          <Donut value={mock.spent / mock.pool} size={64} stroke={8} color={bandColor}>
            <span className="num text-[11px] font-semibold">{usedPct}%</span>
          </Donut>
        </div>
        <div className="mt-5 flex justify-between border-t border-black/15 pt-3 text-xs font-medium">
          <span>{mock.daysLeft} days left</span>
          <span>Payday {mock.nextPayday}</span>
        </div>
      </section>

      <section className="mt-5 divide-y divide-border rounded-2xl bg-surface-1 px-4">
        <Line label="Cash" value={money(mock.cash, false)} note="+ Emergency ••••" />
        <Line label="Debts" value={`−${money(mock.debts, false)}`} note="Student loan $48.5k" />
        <Line label="Investments" value={money(mock.investments, false)} note="—" />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Next bills</h2>
        <ol className="relative ml-1.5 border-l border-dashed border-border">
          {mock.upcoming.map((u) => (
            <li key={u.date + u.amount} className="relative pb-4 pl-5 opacity-60 last:pb-0">
              <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{u.name}</span>
                <span className="num text-sm">−{money(u.amount, false)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {u.date} · in {u.inDays} days
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Line({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{note}</span>
      </span>
      <span className="num text-lg font-semibold">{value}</span>
      <ArrowUpRight className="size-4 text-muted-foreground" />
    </div>
  );
}
