"use client";

import { useState } from "react";
import { Landmark, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { AnimatedCents } from "@/components/animated-number";
import { BackButton } from "@/components/back-button";
import { EmergencyPinSheet } from "@/components/emergency-pin";
import { OwedPanel } from "@/components/owed-panel";
import { UpdateBalance } from "@/components/update-balance";

type Bank = { id: string; name: string; cents: number; institution: string | null; last4: string | null };

/** /cash: bank accounts + the PIN-protected emergency fund (§3.1). */
export function CashOverview({
  bank,
  bankTotal,
  emergency,
}: {
  bank: Bank[];
  bankTotal: number;
  emergency: { id: string; name: string; institution: string | null } | null;
}) {
  const [revealed, setRevealed] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <BackButton fallback="/" />
      <header className="-mt-3 px-1">
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
              <UpdateBalance
                accountId={b.id}
                name={b.name}
                current={b.cents}
                debt={false}
                trigger={
                  <button type="button" className="flex flex-col items-end" aria-label={`Update ${b.name} balance`}>
                    <AnimatedCents value={b.cents} className="num text-base font-semibold" />
                    <span className="text-[11px] text-lime-ink">Update</span>
                  </button>
                }
              />
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

      <OwedPanel />

      <EmergencyPinSheet open={pinOpen} onOpenChange={setPinOpen} institution={emergency?.institution} onUnlocked={setRevealed} />
    </div>
  );
}
