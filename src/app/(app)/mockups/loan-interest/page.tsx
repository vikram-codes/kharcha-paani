import type { ReactNode } from "react";
import { BackButton } from "@/components/back-button";
import { Reveal } from "@/components/reveal";
import { Ring } from "@/components/ring";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentLoan } from "@/lib/data";
import { formatCents } from "@/lib/money";

/**
 * MOCKUPS: three takes on an "interest so far" card for the student loan page.
 * Real balance and rate; borrowed and repaid are stand-ins until the owner
 * confirms them (sanctioned ₹24.29L assumed fully paid out; repaid = EMIs in the app).
 */
const SANCTIONED_INR = 24_29_000;
const EMI_INR = 34_070;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const lakh = (v: number) => `₹${(v / 1_00_000).toFixed(2)}L`;

export default function Page() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pb-10 md:max-w-xl">
      <BackButton fallback="/debts/student-loan" label="Student loan" />
      <div className="px-1">
        <h1 className="text-lg font-semibold tracking-tight">Interest card · mockups</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Real balance and rate. Borrowed (₹24.29L) and repaid (EMIs recorded in the app) are stand-ins until you confirm them.
        </p>
      </div>
      <Reveal fallback={<Skeleton className="h-[900px] rounded-3xl" />}>
        <Cards />
      </Reveal>
    </div>
  );
}

async function Cards() {
  const l = await getStudentLoan();
  if (!l) return <p className="text-sm text-muted-foreground">No student loan found.</p>;
  const fx = l.fxRate ?? 61.82;
  const owed = Math.round((l.owed / 100) * fx);
  const repaid = l.payments.length * EMI_INR;
  const interest = owed - SANCTIONED_INR + repaid;
  const perMonth = Math.round((owed * l.apr) / 100 / 12);
  const perDay = Math.round((owed * l.apr) / 100 / 365);
  const emiToInterest = Math.min(1, perMonth / EMI_INR);
  const cad = (v: number) => formatCents(Math.round((v / fx) * 100), { whole: true });
  const d = { owed, repaid, interest, perMonth, perDay, emiToInterest, apr: l.apr, cad };

  return (
    <div className="flex flex-col gap-8">
      <Labelled tag="A" title="Breakdown bar" note="One bar: what you borrowed plus the interest piled on top, with the repaid slice. Reads like a receipt underneath.">
        <CardA {...d} />
      </Labelled>
      <Labelled tag="B" title="Interest meter" note="Big interest number with a ring for how much of what you owe is interest, and where each EMI goes.">
        <CardB {...d} />
      </Labelled>
      <Labelled tag="C" title="Running tally" note="Numbers first: interest so far, what it adds each month and day, and the EMI split. Compact, no chart.">
        <CardC {...d} />
      </Labelled>
    </div>
  );
}

type D = { owed: number; repaid: number; interest: number; perMonth: number; perDay: number; emiToInterest: number; apr: number; cad: (v: number) => string };

function Labelled({ tag, title, note, children }: { tag: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <span className="grid size-6 place-items-center rounded-full bg-lime text-xs font-bold text-on-lime">{tag}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="px-1 text-xs text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}

/* ── A: breakdown bar ─────────────────────────────────────────── */
function CardA({ owed, repaid, interest, perMonth, cad }: D) {
  const total = SANCTIONED_INR + interest;
  const pct = (v: number) => `${(v / total) * 100}%`;
  return (
    <div className="rounded-2xl bg-surface-1 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Interest so far</p>
          <p className="num mt-1 text-[32px] leading-none font-semibold tracking-tight text-budget-high">{inr.format(interest)}</p>
          <p className="num mt-1.5 text-xs text-muted-foreground">≈ {cad(interest)} · on {lakh(SANCTIONED_INR)} borrowed</p>
        </div>
        <span className="num rounded-full bg-budget-high/12 px-2 py-1 text-[11px] font-medium text-budget-high">+{Math.round((interest / SANCTIONED_INR) * 100)}%</span>
      </div>

      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full bg-muted-foreground/45" style={{ width: pct(SANCTIONED_INR - repaid) }} />
        <div className="h-full bg-budget-high" style={{ width: pct(interest) }} />
        <div className="h-full bg-money-in" style={{ width: pct(repaid), minWidth: repaid ? 3 : 0 }} />
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        <Line dot="bg-muted-foreground/45" label="Borrowed" value={inr.format(SANCTIONED_INR)} />
        <Line dot="bg-budget-high" label="Interest added" value={`+${inr.format(interest)}`} tone="text-budget-high" />
        <Line dot="bg-money-in" label="Repaid" value={`−${inr.format(repaid)}`} tone="text-money-in" />
        <div className="my-0.5 border-t border-border" />
        <Line label="Owed now" value={inr.format(owed)} bold />
      </div>
      <p className="num mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        Adding about <span className="font-medium text-foreground">{inr.format(perMonth)}</span> a month at today&apos;s balance.
      </p>
    </div>
  );
}

function Line({ dot, label, value, tone, bold }: { dot?: string; label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {dot ? <span className={`size-2 rounded-full ${dot}`} /> : <span className="size-2" />}
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`num ml-auto ${bold ? "font-semibold" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

/* ── B: interest meter ────────────────────────────────────────── */
function CardB({ owed, interest, perMonth, emiToInterest, apr, cad }: D) {
  const share = interest / owed;
  return (
    <div className="rounded-2xl bg-surface-1 p-4">
      <div className="flex items-center gap-4">
        <Ring value={share} size={112} stroke={11} color="var(--budget-high)" track="var(--surface-3)" label={`${Math.round(share * 100)}% of what you owe is interest`}>
          <div className="flex flex-col items-center">
            <span className="num text-xl font-semibold">{Math.round(share * 100)}%</span>
            <span className="text-[10px] text-muted-foreground">is interest</span>
          </div>
        </Ring>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Interest so far</p>
          <p className="num text-[26px] leading-tight font-semibold tracking-tight">{inr.format(interest)}</p>
          <p className="num text-xs text-muted-foreground">≈ {cad(interest)}</p>
          <p className="num mt-2 text-xs text-muted-foreground">
            of <span className="text-foreground">{inr.format(owed)}</span> owed · {apr}% a year
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-muted-foreground">Each EMI of {inr.format(EMI_INR)}</span>
        </div>
        <div className="flex h-2.5 gap-1 overflow-hidden rounded-full">
          <div className="h-full rounded-full bg-budget-high" style={{ flex: emiToInterest }} />
          <div className="h-full rounded-full bg-lime" style={{ flex: 1 - emiToInterest }} />
        </div>
        <div className="num mt-1.5 flex justify-between text-[11px]">
          <span className="text-budget-high">{inr.format(perMonth)} interest</span>
          <span className="text-lime-ink">{inr.format(EMI_INR - perMonth)} to the loan</span>
        </div>
      </div>
    </div>
  );
}

/* ── C: running tally ─────────────────────────────────────────── */
function CardC({ owed, interest, perMonth, perDay, emiToInterest, cad }: D) {
  return (
    <div className="overflow-hidden rounded-2xl bg-surface-1">
      <div className="bg-gradient-to-br from-budget-high/15 to-transparent p-4">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Interest charged to date</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="num text-[34px] leading-none font-semibold tracking-tight">{inr.format(interest)}</p>
          <span className="num text-xs text-muted-foreground">≈ {cad(interest)}</span>
        </div>
        <p className="num mt-2 text-xs text-muted-foreground">
          {lakh(SANCTIONED_INR)} borrowed → {lakh(owed)} owed today
        </p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
        <Stat label="Per day" value={inr.format(perDay)} />
        <Stat label="Per month" value={inr.format(perMonth)} />
        <Stat label="Of each EMI" value={`${Math.round(emiToInterest * 100)}%`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="num text-sm font-semibold text-budget-high">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
