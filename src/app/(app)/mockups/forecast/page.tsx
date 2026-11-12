import type { ReactNode } from "react";
import { BackButton } from "@/components/back-button";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { getHome } from "@/lib/data";
import { formatDay, formatShort } from "@/lib/dates";
import type { CashForecast } from "@/lib/forecast";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * MOCKUPS: three takes on a "cash before payday" card for Home (#2).
 * Real chequing balance, bills paid from chequing and paydays.
 */
export default function Page() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pb-10 md:max-w-xl">
      <BackButton fallback="/" label="Home" />
      <div className="px-1">
        <h1 className="text-lg font-semibold tracking-tight">Cash before payday · mockups</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Your real chequing balance, bills paid from chequing and paydays. Card bills aren&apos;t in it: they leave chequing when you pay the card.
        </p>
      </div>
      <Reveal fallback={<Skeleton className="h-[1100px] rounded-3xl" />}>
        <Cards />
      </Reveal>
    </div>
  );
}

type F = CashForecast & { account: string; payCents: number };

async function Cards() {
  const h = await getHome();
  const f = h.forecast as F | null;
  if (!f || !f.periods.length) return <p className="text-sm text-muted-foreground">No chequing account or payday set up.</p>;
  return (
    <div className="flex flex-col gap-8">
      <Option letter="A" title="Low point + balance line" note="One number: the lowest chequing gets before payday. The line shows the next two pay periods.">
        <CardA f={f} />
      </Option>
      <Option letter="B" title="One tile per pay period" note="Each pay period's lowest point side by side, with what takes it there.">
        <CardB f={f} />
      </Option>
      <Option letter="C" title="Running balance timeline" note="Every bill and payday in order, with chequing after each. The low points are marked.">
        <CardC f={f} />
      </Option>
    </div>
  );
}

function Option({ letter, title, note, children }: { letter: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="px-1">
        <p className="text-sm font-semibold">
          {letter}. {title}
        </p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

/** Red below $0, orange below $200, otherwise normal. */
const tone = (c: number) => (c < 0 ? "text-budget-over" : c < 20000 ? "text-budget-high" : "");
const whole = (c: number) => formatCents(c, { whole: true });

/** Step line of the end-of-day balance, payday markers, low points as dots. */
function Line({ f, height = 72 }: { f: F; height?: number }) {
  const days = f.days;
  const t0 = Date.parse(days[0].date);
  const t1 = Date.parse(days[days.length - 1].date) || t0 + 1;
  const span = Math.max(1, t1 - t0);
  const max = Math.max(...days.map((d) => d.cents), 0);
  const min = Math.min(...days.map((d) => d.cents), 0);
  const x = (iso: string) => ((Date.parse(iso) - t0) / span) * 300;
  const y = (c: number) => 6 + (1 - (c - min) / Math.max(1, max - min)) * (height - 12);
  let d = `M0 ${y(days[0].cents)}`;
  for (let i = 1; i < days.length; i++) d += ` H${x(days[i].date)} V${y(days[i].cents)}`;
  d += ` H300`;
  return (
    <svg viewBox={`0 0 300 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      {min < 0 && <line x1="0" x2="300" y1={y(0)} y2={y(0)} stroke="var(--budget-over)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      {f.periods.map((p) => (
        <line key={p.payday} x1={x(p.payday)} x2={x(p.payday)} y1="0" y2={height} stroke="var(--money-in)" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={d} fill="none" stroke="var(--lime)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CardA({ f }: { f: F }) {
  const p = f.periods[0];
  const next = f.periods[1];
  return (
    <div className="rounded-3xl bg-surface-1 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Before payday</h2>
        <span className="text-xs text-muted-foreground">Chequing</span>
      </div>
      <p className={cn("num mt-2 text-[34px] leading-none font-semibold tracking-tight", tone(p.low.cents))}>{whole(p.low.cents)}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        lowest point, {p.low.date === f.today ? "today" : formatDay(p.low.date)} · now {whole(f.start)}
      </p>
      <div className="mt-4">
        <Line f={f} />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Today</span>
          {f.periods.map((q) => (
            <span key={q.payday} className="text-money-in">
              Payday {formatShort(q.payday)}
            </span>
          ))}
        </div>
      </div>
      {next && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Then <span className="num text-money-in">+{whole(f.payCents)}</span> on {formatShort(p.payday)}. Next low:{" "}
          <span className={cn("num font-medium text-foreground", tone(next.low.cents))}>{whole(next.low.cents)}</span> on {formatShort(next.low.date)}
          {next.bills.some((b) => b.date === next.low.date) ? `, after ${next.bills.filter((b) => b.date === next.low.date).map((b) => b.label).join(" + ")}` : ""}.
        </p>
      )}
    </div>
  );
}

function CardB({ f }: { f: F }) {
  return (
    <div className="rounded-3xl bg-surface-1 p-4">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-muted-foreground">Chequing before payday</h2>
        <span className="num text-xs text-muted-foreground">now {whole(f.start)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {f.periods.map((p, i) => {
          const from = i === 0 ? "Now" : formatShort(f.periods[i - 1].payday);
          const out = p.bills.reduce((t, b) => t + b.cents, 0);
          return (
            <div key={p.payday} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
              <p className="text-[11px] text-muted-foreground">
                {from} → {formatShort(p.payday)}
              </p>
              <div>
                <p className={cn("num text-xl leading-none font-semibold", tone(p.low.cents))}>{whole(p.low.cents)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">lowest, {p.low.date === f.today ? "today" : formatShort(p.low.date)}</p>
              </div>
              <div className="flex flex-col gap-1 border-t border-border pt-2 text-[11px]">
                {p.bills.length ? (
                  p.bills.map((b, j) => (
                    <span key={j} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">
                        {formatShort(b.date)} {b.label}
                      </span>
                      <span className="num shrink-0 whitespace-nowrap">{formatCents(b.cents)}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">No bills from chequing</span>
                )}
                {p.bills.length > 1 && (
                  <span className="flex justify-between gap-2 font-medium">
                    <span>Total</span>
                    <span className="num shrink-0 whitespace-nowrap">{formatCents(out)}</span>
                  </span>
                )}
              </div>
              <p className="mt-auto text-[11px] text-money-in">
                +{whole(f.payCents)} on {formatShort(p.payday)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardC({ f }: { f: F }) {
  type Row = { date: string; label: string; cents: number; after: number; payday?: boolean; low?: boolean };
  const rows: Row[] = [];
  let bal = f.start;
  f.periods.forEach((p) => {
    for (const b of p.bills) {
      bal += b.cents;
      rows.push({ date: b.date, label: b.label, cents: b.cents, after: bal, low: b.date === p.low.date && bal === p.low.cents });
    }
    bal += f.payCents;
    rows.push({ date: p.payday, label: "Payday", cents: f.payCents, after: bal, payday: true });
  });
  return (
    <div className="rounded-3xl bg-surface-1 p-4">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-muted-foreground">Chequing, next 2 paydays</h2>
      </div>
      <ol className="relative ml-2 border-l border-border pl-4">
        <li className="relative pb-3">
          <span className="absolute top-1 -left-[21px] size-2.5 rounded-full bg-foreground" />
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Today</span>
            <span className="num font-semibold">{formatCents(f.start)}</span>
          </div>
        </li>
        {rows.map((r, i) => (
          <li key={i} className="relative pb-3 last:pb-0">
            <span className={cn("absolute top-1.5 -left-[20px] size-2 rounded-full", r.payday ? "bg-money-in" : r.low ? "bg-budget-high" : "bg-surface-3")} />
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">{formatShort(r.date)}</span> <span className={r.payday ? "text-money-in" : ""}>{r.label}</span>
              </span>
              <span className={cn("num shrink-0 text-xs", r.payday ? "text-money-in" : "text-muted-foreground")}>
                {r.cents > 0 ? "+" : ""}
                {formatCents(r.cents)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              {r.low ? <span className="rounded-full bg-budget-high/15 px-2 py-0.5 text-[10px] font-medium text-budget-high">Lowest before payday</span> : <span />}
              <span className={cn("num font-medium", tone(r.after))}>{formatCents(r.after)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
