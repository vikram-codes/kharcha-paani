import { notFound } from "next/navigation";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { FIRST_ACTIVITY_MONTH, getActivity } from "@/lib/data";
import { isMonthKey } from "@/lib/dates";
import { TransactionsView } from "./transactions-view";

/** Shared by /transactions (this month) and /transactions/YYYY-MM. */
export function TransactionsPage({ month }: { month: Promise<string | undefined> }) {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal fallback={<TransactionsSkeleton />}>
        <Loader month={month} />
      </Reveal>
    </div>
  );
}

async function Loader({ month }: { month: Promise<string | undefined> }) {
  const m = await month;
  if (m !== undefined && (!isMonthKey(m) || m < FIRST_ACTIVITY_MONTH)) notFound();
  const initial = await getActivity(m);
  return <TransactionsView initial={initial} firstMonth={FIRST_ACTIVITY_MONTH} />;
}

function TransactionsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-10 w-44 rounded-lg" />
        <Skeleton className="size-10 rounded-xl" />
      </div>
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-8 w-72 rounded-full" />
      <Skeleton className="h-[220px] rounded-2xl" />
      <Skeleton className="h-[300px] rounded-2xl" />
    </div>
  );
}
