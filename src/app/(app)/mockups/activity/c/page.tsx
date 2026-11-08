import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { getActivity } from "@/lib/data";
import { MockupSwitch, MockupC } from "../activity-mockups";

/** MOCKUP C for the Transactions screen. Shows October 2026 (more rows) + this month's upcoming bills. */
export default function Page() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 md:max-w-3xl">
      <MockupSwitch current="c" />
      <Reveal fallback={<Skeleton className="h-[640px] rounded-3xl" />}>
        <Data />
      </Reveal>
    </div>
  );
}

async function Data() {
  const [oct, now] = await Promise.all([getActivity("2026-10"), getActivity()]);
  return <MockupC rows={oct.rows} upcoming={now.upcoming} monthLabel="October 2026" />;
}
