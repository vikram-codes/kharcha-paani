import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { Ring } from "@/components/ring";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMonth, formatShort } from "@/lib/dates";
import { getStudentLoan } from "@/lib/data";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Student loan" };

export default function StudentLoanPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-xl">
      <BackButton fallback="/debts" label="Debts" />
      <Suspense fallback={<LoanSkeleton />}>
        <Loan />
      </Suspense>
    </div>
  );
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

async function Loan() {
  const l = await getStudentLoan();
  if (!l) notFound();
  const total = l.owed + l.paid;
  const leftShare = total > 0 ? l.owed / total : 0;
  const paidShare = total > 0 ? l.paid / total : 0;

  return (
    <>
      <section className="flex flex-col items-center pt-2">
        <h1 className="mb-6 text-lg font-semibold tracking-tight">Student loan</h1>
        {/* Red = still owed, green = paid so far (grows as EMIs go in). */}
        <Ring
          value={paidShare}
          size={264}
          stroke={18}
          color="var(--money-in)"
          track="var(--budget-over)"
          label={`${Math.round(leftShare * 100)}% of the loan left, ${Math.round(paidShare * 100)}% paid`}
        >
          <div className="flex flex-col items-center">
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-money-in">
              <span className="num">{formatCents(l.paid, { whole: true })}</span> paid
            </span>
            <span className="num mt-3 text-[38px] leading-none font-semibold tracking-tight">
              {formatCents(l.owed, { whole: true })}
            </span>
            <span className="mt-2 text-xs text-muted-foreground">left to pay</span>
          </div>
        </Ring>
        {l.inr != null && l.fxRate && (
          <p className="num mt-4 text-xs text-muted-foreground">
            {inr.format(l.inr)} owed · ₹{l.fxRate} per CAD
          </p>
        )}
      </section>

      {l.interest && <InterestCard i={l.interest} />}

      {/* This month's maths */}
      <section className="rounded-2xl bg-surface-1 p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Every month at {l.apr}% a year</h2>
        <Row label={`Interest added ${formatShort(l.nextInterestDate)}`} value={`+${formatCents(l.nextInterest)}`} tone="warn" />
        <Row label={l.emiInr ? `EMI (${inr.format(l.emiInr)}, counted as CAD)` : "EMI"} value={`−${formatCents(l.monthlyPayment)}`} />
        <div className="my-2 border-t border-border" />
        <Row
          label="Goes to the loan itself"
          value={formatCents(l.toPrincipal)}
          tone={l.toPrincipal > 0 ? "good" : "warn"}
          bold
        />
        {l.monthlyPayment > 0 && (
          <div className="mt-3 flex h-2 gap-1 overflow-hidden rounded-full">
            <div className="h-full rounded-full bg-budget-high" style={{ flex: l.nextInterest }} />
            <div className="h-full rounded-full bg-lime" style={{ flex: Math.max(0, l.toPrincipal) }} />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {l.payoff
            ? `At ${formatCents(l.monthlyPayment, { whole: true })}/month you're debt-free around ${formatMonth(l.payoff)}.`
            : "The monthly payment doesn't cover the interest yet."}
        </p>
      </section>

      {l.payments.length > 0 && (
        <section className="rounded-2xl bg-surface-1 p-4">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">EMI payments</h2>
          <ul className="divide-y divide-border">
            {l.payments.map((p, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span>{formatShort(p.date)}</span>
                <span className="num font-medium">{formatCents(p.cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

type Interest = NonNullable<Awaited<ReturnType<typeof getStudentLoan>>>["interest"] & {};

const lakh = (v: number) => `₹${(v / 1_00_000).toFixed(2)}L`;

/**
 * Interest charged to date (owner picked mockup C's header + A's breakdown,
 * Nov 10 2026). Facts only: what was borrowed, what interest added, what's
 * been repaid, and what it adds a month now.
 */
function InterestCard({ i }: { i: Interest }) {
  const cad = formatCents(Math.round((i.chargedInr / i.fx) * 100), { whole: true });
  return (
    <section className="overflow-hidden rounded-2xl bg-surface-1">
      <div className="bg-gradient-to-br from-budget-high/15 to-transparent p-4">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Interest charged to date</h2>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <p className="num text-[34px] leading-none font-semibold tracking-tight">{inr.format(i.chargedInr)}</p>
          <span className="num text-xs text-muted-foreground">≈ {cad}</span>
        </div>
        <p className="num mt-2 text-xs text-muted-foreground">
          {lakh(i.borrowedInr)} borrowed → {lakh(i.owedInr)} owed today
        </p>
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-4 text-sm">
        <Line dot="bg-muted-foreground/45" label="Borrowed" value={inr.format(i.borrowedInr)} />
        <Line dot="bg-budget-high" label="Interest added" value={`+${inr.format(i.chargedInr)}`} tone="text-budget-high" />
        <Line dot="bg-money-in" label="Repaid" value={`−${inr.format(i.repaidInr)}`} tone="text-money-in" />
        <div className="my-0.5 border-t border-border" />
        <Line label="Owed now" value={inr.format(i.owedInr)} bold />
        <p className="num mt-1 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          Adding about <span className="font-medium text-foreground">{inr.format(i.perMonthInr)}</span> a month at today&apos;s balance.
        </p>
      </div>
    </section>
  );
}

function Line({ dot, label, value, tone, bold }: { dot?: string; label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2 shrink-0 rounded-full ${dot ?? ""}`} />
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`num ml-auto ${bold ? "font-semibold" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: "good" | "warn"; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span
        className={`num ${bold ? "font-semibold" : ""} ${tone === "good" ? "text-money-in" : tone === "warn" ? "text-budget-high" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function LoanSkeleton() {
  return (
    <>
      <Skeleton className="mx-auto size-[264px] rounded-full" />
      <Skeleton className="h-48 rounded-2xl" />
    </>
  );
}
