import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { SummaryPayload } from "@/app/actions/summary";
import { BackButton } from "@/components/back-button";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { isMonthKey, monthKey, todayISO } from "@/lib/dates";
import { FIRST_MONTH, HISTORY, getHistorySummary, getMonthSummary } from "@/lib/data";
import { SummaryPager } from "./summary-view";

export const metadata: Metadata = { title: "Summary" };

/**
 * The first month is rendered on the server (skeleton only on a cold load).
 * After that, SummaryPager switches months in place without blanking.
 */
export default function SummaryPage({ params }: PageProps<"/summary/[month]">) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-2 md:max-w-3xl">
      <BackButton fallback="/" />
      <Reveal fallback={<SummarySkeleton />}>
        <Initial params={params} />
      </Reveal>
    </div>
  );
}

async function Initial({ params }: { params: PageProps<"/summary/[month]">["params"] }) {
  const { month } = await params;
  if (month !== HISTORY.key) {
    if (!isMonthKey(month)) notFound();
    if (month < FIRST_MONTH) redirect(`/summary/${HISTORY.key}`);
  }
  await connection();
  const current = monthKey(todayISO());
  const initial: SummaryPayload =
    month === HISTORY.key
      ? { kind: "history", key: month, data: await getHistorySummary() }
      : { kind: "month", key: month, data: await getMonthSummary(month) };
  return <SummaryPager initial={initial} current={current} />;
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="size-10 rounded-xl" />
      </div>
      <Skeleton className="h-[200px] rounded-3xl" />
      <Skeleton className="h-[120px] rounded-2xl" />
      <Skeleton className="h-[360px] rounded-2xl" />
    </div>
  );
}
