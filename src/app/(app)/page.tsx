import { connection } from "next/server";
import { Budget, Cash, ComingUp, Greeting, Recent, Tiles, TopCategories, loadWideHome } from "@/components/home-blocks";
import { Reveal } from "@/components/reveal";
import { SavingsPromptCard } from "@/components/savings-prompt";
import { Skeleton } from "@/components/ui/skeleton";
import { getSavingsPrompts } from "@/lib/data";

/**
 * Home (owner picked Nov 9 2026).
 * Phone: Cash → savings prompts → spent vs budget → Debts + Investments → Coming up.
 * Desktop (lg+): two columns (left: Cash, Debts + Investments; right: spent vs budget,
 * where it went, recent) with Coming up across the bottom.
 * The column wrappers are `display: contents` on phones, so `order` puts the
 * cards in the phone sequence; on desktop they become real columns.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl lg:max-w-6xl">
      <Reveal fallback={<HomeSkeleton />}>
        <Home />
      </Reveal>
    </div>
  );
}

async function Home() {
  await connection();
  const [d, prompts] = await Promise.all([loadWideHome(), getSavingsPrompts()]);
  return (
    <div className="flex flex-col gap-5">
      <Greeting h={d.h} />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1 lg:order-none">
            <Cash h={d.h} />
          </div>
          {prompts.map((p) => (
            <div key={p.key} className="order-2 lg:order-none">
              <SavingsPromptCard prompt={p} />
            </div>
          ))}
          <div className="order-4 lg:order-none">
            <Tiles h={d.h} cols={2} />
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-3 lg:order-none">
            <Budget h={d.h} />
          </div>
          <div className="hidden lg:block">
            <TopCategories d={d} />
          </div>
          <div className="hidden lg:block">
            <Recent d={d} />
          </div>
        </div>
        {d.h.upcoming.length > 0 && (
          <div className="order-5 lg:order-none lg:col-span-2">
            <ComingUp h={d.h} />
          </div>
        )}
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-7 w-56 rounded-lg" />
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[200px] rounded-3xl" />
          <Skeleton className="h-[150px] rounded-2xl" />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[134px] rounded-2xl" />
          <Skeleton className="hidden h-[190px] rounded-2xl lg:block" />
        </div>
      </div>
      <Skeleton className="h-[170px] rounded-2xl" />
    </div>
  );
}
