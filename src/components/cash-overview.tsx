"use client";

import { useState } from "react";
import { HandCoins, Landmark, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { AnimatedCents } from "@/components/animated-number";
import { EmergencyPinSheet } from "@/components/emergency-pin";
import { formatCents } from "@/lib/money";

type Bank = { id: string; name: string; cents: number; institution: string | null; last4: string | null };

/** /cash: bank accounts + the PIN-protected emergency fund (§3.1). */
export function CashOverview({
  bank,
  bankTotal,
  emergency,
  owedToMe,
}: {
  bank: Bank[];
  bankTotal: number;
  emergency: { id: string; name: string; institution: string | null } | null;
  owedToMe: number;
}) {
  const [revealed, setRevealed] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <header className="px-1">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Cash{revealed != null && <span className="ml-1.5 normal-case tracking-normal text-lime-ink">· incl. emergency</span>}
        </p>
        <AnimatedCents value={bankTotal + (revealed ?? 0)} className="num mt-1 block text-[40px] leading-none font-semibold tracking-tight" />
        <p className="mt-2 text-sm text-muted-foreground">
          {revealed == null ? "Bank accounts. The emergency fund is added once you unlock it." : "Bank accounts + emergency fund."}
        </p>
      </header>

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Bank accounts</h2>
        <div className="divide-y divide-border rounded-2xl bg-surface-1 px-4">
          {bank.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-3.5">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
                <Landmark className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{b.name}</span>
                <span className="text-xs text-muted-foreground">
                  {b.institution}
                  {b.last4 ? ` · •••• ${b.last4}` : ""}
                </span>
              </span>
              <AnimatedCents value={b.cents} className="num text-base font-semibold" />
            </div>
          ))}
        </div>
      </section>

      {emergency && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Emergency fund</h2>
          <button
            type="button"
            onClick={() => (revealed == null ? setPinOpen(true) : setRevealed(null))}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-left transition-colors duration-(--duration-fast) hover:bg-surface-1"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
              <ShieldCheck className="size-[18px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{revealed == null ? "Hidden" : (emergency.institution ?? emergency.name)}</span>
              <span className="text-xs text-muted-foreground">{revealed == null ? "Tap and enter your PIN to show it" : "Tap to hide again"}</span>
            </span>
            {revealed == null ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="size-4" /> ••••
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <AnimatedCents value={revealed} className="num text-base font-semibold" />
                <LockOpen className="size-4 text-lime-ink" />
              </span>
            )}
          </button>
        </section>
      )}

      {owedToMe > 0 && (
        <section className="flex items-center gap-3 rounded-2xl bg-surface-1/60 p-4 text-muted-foreground">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-2">
            <HandCoins className="size-[18px]" />
          </span>
          <span className="flex-1 text-sm">
            Owed to you
            <span className="block text-xs">Not counted in Cash until it&apos;s paid back.</span>
          </span>
          <span className="num text-sm">{formatCents(owedToMe)}</span>
        </section>
      )}

      <EmergencyPinSheet open={pinOpen} onOpenChange={setPinOpen} institution={emergency?.institution} onUnlocked={setRevealed} />
    </div>
  );
}
