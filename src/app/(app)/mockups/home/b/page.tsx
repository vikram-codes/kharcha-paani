import { ChevronRight, CreditCard, Eye, TrendingUp, Wallet } from "lucide-react";
import { MockupSwitcher, UpcomingRow, bandColor, left, mock, money, usedPct } from "../_shared";

/** B — "The stack": three big balance tiles first; left-to-spend as a slim bar. */
export default function HomeMockupB() {
  return (
    <div className="mx-auto max-w-md">
      <MockupSwitcher current="b" />

      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Hey Vikram</h1>

      <section className="mb-3 rounded-2xl bg-surface-1 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Left to spend in {mock.month}</span>
          <span className="num text-xs text-muted-foreground">{usedPct}%</span>
        </div>
        <p className="num mt-1 text-3xl font-semibold tracking-tight" style={{ color: bandColor }}>
          {money(left)}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: bandColor }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ~{money(Math.floor(left / mock.daysLeft))}/day for {mock.daysLeft} days · payday {mock.nextPayday}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <BigTile icon={Wallet} label="Cash" value={money(mock.cash, false)} sub="Chequing · Savings · Emergency ••••" accent />
        <BigTile icon={CreditCard} label="Debts" value={money(mock.debts, false)} sub="3 cards · Student loan · Affirm" />
        <BigTile icon={TrendingUp} label="Investments" value={money(mock.investments, false)} sub="Add your first account" />
      </section>

      <section className="mt-6 rounded-2xl border border-dashed border-border px-4 py-1">
        {mock.upcoming.map((u) => (
          <UpcomingRow key={u.date + u.amount} item={u} />
        ))}
      </section>
    </div>
  );
}

function BigTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-1 p-4">
      <span
        className={
          accent
            ? "grid size-11 place-items-center rounded-xl bg-lime text-on-lime"
            : "grid size-11 place-items-center rounded-xl bg-surface-2 text-lime-ink"
        }
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {label} {accent && <Eye className="size-3.5" />}
        </span>
        <span className="num text-2xl font-semibold tracking-tight">{value}</span>
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </div>
  );
}
