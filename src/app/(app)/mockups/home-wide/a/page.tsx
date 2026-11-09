import { connection } from "next/server";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Budget, Cash, ComingUp, Greeting, Recent, Switch, Tiles, TopCategories, loadWideHome } from "../blocks";

/** MOCKUP A: left = balances (Cash, Debts, Investments, Coming up); right = this month (budget, categories, recent). */
export default function Page() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-6xl">
      <Switch current="a" />
      <Reveal fallback={<Skeleton className="h-[600px] rounded-3xl" />}>
        <Body />
      </Reveal>
    </div>
  );
}

async function Body() {
  await connection();
  const d = await loadWideHome();
  return (
    <div className="flex flex-col gap-5">
      <Greeting h={d.h} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Cash h={d.h} />
          <Tiles h={d.h} cols={2} />
          <ComingUp h={d.h} />
        </div>
        <div className="flex flex-col gap-5">
          <Budget h={d.h} />
          <TopCategories d={d} />
          <Recent d={d} />
        </div>
      </div>
    </div>
  );
}
