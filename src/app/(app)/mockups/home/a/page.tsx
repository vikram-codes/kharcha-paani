import { ChevronRight, CreditCard, EyeOff, TrendingUp, Wallet } from "lucide-react";
import { Donut, MockupSwitcher, UpcomingRow, band, bandColor, left, mock, money, usedPct } from "../_shared";

/** A — "The ring": left-to-spend is the hero; balances are a compact strip. */
export default function HomeMockupA() {
  return (
    <div className="mx-auto max-w-md">
      <MockupSwitcher current="a" />

      <section className="flex flex-col items-center pt-2 pb-6">
        <p className="mb-4 text-sm text-muted-foreground">{mock.month} · left to spend</p>
        <Donut value={left / mock.pool} size={220} stroke={16} color={bandColor}>
          <div>
            <p className="num text-[40px] leading-none font-semibold tracking-tight">{money(left)}</p>
            <p className="num mt-2 text-xs text-muted-foreground">of {money(mock.pool)}</p>
          </div>
        </Donut>
        <div className="mt-5 flex items-center gap-2 text-xs">
          <span className="rounded-full px-2.5 py-1 font-medium text-black" style={{ background: bandColor }}>
            {usedPct}% used
          </span>
          <span className="text-muted-foreground">
            {mock.daysLeft} days left · payday {mock.nextPayday}
          </span>
        </div>
        <span className="sr-only">Band: {band}</span>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Tile icon={Wallet} label="Cash" value={money(mock.cash)} extra={<EyeOff className="size-3" />} />
        <Tile icon={CreditCard} label="Debts" value={money(mock.debts)} />
        <Tile icon={TrendingUp} label="Invest" value={money(mock.investments)} />
      </section>

      <section className="mt-6">
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Coming up</h2>
        {mock.upcoming.map((u) => (
          <UpcomingRow key={u.date + u.amount} item={u} />
        ))}
      </section>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  extra,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface-1 p-3">
      <span className="flex items-center justify-between text-muted-foreground">
        <Icon className="size-4 text-lime-ink" />
        {extra ?? <ChevronRight className="size-3.5" />}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="num truncate text-[15px] font-semibold">{value}</span>
    </div>
  );
}
