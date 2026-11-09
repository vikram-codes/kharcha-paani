import type { Metadata } from "next";
import { connection } from "next/server";
import { loadGoals } from "@/app/actions/planning";
import { GoalsManager } from "@/components/goals-manager";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal fallback={<Skeleton className="h-64 rounded-2xl" />}>
        <Goals />
      </Reveal>
    </div>
  );
}

async function Goals() {
  await connection();
  return <GoalsManager initial={await loadGoals()} />;
}
