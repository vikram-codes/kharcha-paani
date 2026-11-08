import type { Metadata } from "next";
import { CashOverview } from "@/components/cash-overview";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { getCash } from "@/lib/data";

export const metadata: Metadata = { title: "Cash" };

export default function CashPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal
        fallback={
          <div className="flex flex-col gap-5">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        }
      >
        <Cash />
      </Reveal>
    </div>
  );
}

async function Cash() {
  const c = await getCash();
  return <CashOverview bank={c.bank} bankTotal={c.bankTotal} emergency={c.emergency} owedToMe={c.owedToMe} />;
}
