"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Lock, LockOpen } from "lucide-react";
import { AnimatedCents } from "@/components/animated-number";
import { EmergencyPinSheet } from "@/components/emergency-pin";
import { formatCents } from "@/lib/money";

type Account = { id: string; name: string; cents: number | null; emergency: boolean };

/**
 * Home hero: Cash. The emergency fund is masked; tapping it asks for the PIN,
 * and only then is its amount shown and added to the Cash total.
 */
export function CashCard({
  bankTotal,
  accounts,
  emergencyInstitution,
  owedToMe,
  paydayLabel,
}: {
  bankTotal: number;
  accounts: Account[];
  emergencyInstitution: string | null;
  owedToMe: number;
  paydayLabel: string | null;
}) {
  const [emergency, setEmergency] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const total = bankTotal + (emergency ?? 0);

  return (
    <section className="group relative rounded-3xl bg-surface-1 p-5 ring-1 ring-border transition-transform duration-(--duration-fast) has-[>a:active]:scale-[0.99]">
      {/* Whole card opens /cash; the emergency chip sits above this link. */}
      <Link href="/cash" className="absolute inset-0 rounded-3xl" aria-label="Open Cash" />
      <div className="pointer-events-none relative">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Cash{emergency != null && <span className="ml-1.5 normal-case tracking-normal text-lime-ink">· incl. emergency</span>}
          </p>
          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-(--duration-fast) group-hover:translate-x-0.5" />
        </div>
        <AnimatedCents value={total} className="num mt-2 block text-[44px] leading-none font-semibold tracking-tight" />
        <div className="mt-4 flex flex-wrap gap-2">
          {accounts.map((a) =>
            a.emergency ? (
              <button
                key={a.id}
                type="button"
                onClick={() => (emergency == null ? setPinOpen(true) : setEmergency(null))}
                aria-label={emergency == null ? "Show emergency fund (needs PIN)" : "Hide emergency fund"}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs ring-1 ring-transparent transition-colors duration-(--duration-fast) hover:ring-lime/40"
              >
                <span className="text-muted-foreground">Emergency</span>
                {emergency == null ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Lock className="size-3" /> ••••
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-medium">
                    <span className="num">{formatCents(emergency, { whole: true })}</span>
                    <LockOpen className="size-3 text-lime-ink" />
                  </span>
                )}
              </button>
            ) : (
              <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">{a.name.replace(/^Scotiabank\s+/, "")}</span>
                <span className="num font-medium">{formatCents(a.cents ?? 0, { whole: true })}</span>
              </span>
            ),
          )}
        </div>
        <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground">
          <span className="text-muted-foreground/70">{owedToMe ? `${formatCents(owedToMe, { whole: true })} owed to you` : ""}</span>
          {paydayLabel && (
            <span>
              Payday <span className="text-foreground">{paydayLabel}</span>
            </span>
          )}
        </div>
      </div>
      <EmergencyPinSheet open={pinOpen} onOpenChange={setPinOpen} institution={emergencyInstitution} onUnlocked={setEmergency} />
    </section>
  );
}
