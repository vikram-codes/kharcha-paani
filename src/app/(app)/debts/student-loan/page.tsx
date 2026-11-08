import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Ring } from "@/components/ring";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMonth, formatShort } from "@/lib/dates";
import { getStudentLoan } from "@/lib/data";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Student loan" };

export default function StudentLoanPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-xl">
      <Link href="/debts" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Debts
      </Link>
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

  return (
    <>
      <section className="flex flex-col items-center pt-2">
        <h1 className="mb-6 text-lg font-semibold tracking-tight">Student loan</h1>
        <Ring value={leftShare} size={264} stroke={18} label={`${Math.round(leftShare * 100)}% of the loan left`}>
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
            {inr.format(l.inr)} at ₹{l.fxRate} per CAD · as of {formatShort(l.anchorDate)}
          </p>
        )}
      </section>

      {/* This month's maths */}
      <section className="rounded-2xl bg-surface-1 p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Every month at {l.apr}% a year</h2>
        <Row label={`Interest added ${formatShort(l.nextInterestDate)}`} value={`+${formatCents(l.nextInterest)}`} tone="warn" />
        <Row label="EMI (₹34,070, counted as CAD)" value={`−${formatCents(l.monthlyPayment)}`} />
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
