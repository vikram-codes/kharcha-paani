import type { Metadata } from "next";
import { connection } from "next/server";
import { loadInvestments } from "@/app/actions/planning";
import { InvestmentsManager } from "@/components/investments-manager";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Investments" };

export default function InvestmentsPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <Investments />
      </Reveal>
    </div>
  );
}

async function Investments() {
  await connection();
  return <InvestmentsManager initial={await loadInvestments()} />;
}
