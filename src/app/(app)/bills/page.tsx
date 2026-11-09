import type { Metadata } from "next";
import { connection } from "next/server";
import { loadBills } from "@/app/actions/planning";
import { BillsManager } from "@/components/bills/bills-manager";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Bills" };

export default function BillsPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal
        fallback={
          <div className="flex flex-col gap-5">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        }
      >
        <Bills />
      </Reveal>
    </div>
  );
}

async function Bills() {
  await connection();
  return <BillsManager initial={await loadBills()} />;
}
