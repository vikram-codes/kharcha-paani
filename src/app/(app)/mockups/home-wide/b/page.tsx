import { connection } from "next/server";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Budget, Cash, ComingUp, Greeting, Recent, Switch, Tiles, TopCategories, loadWideHome } from "../blocks";

/** MOCKUP B: rows of pairs: Cash | Budget, Debts+Investments | Coming up, Recent | Categories. */
export default function Page() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-6xl">
      <Switch current="b" />
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
      <div className="grid gap-5 lg:grid-cols-2">
        <Cash h={d.h} />
        <Budget h={d.h} className="h-full" />
        <Tiles h={d.h} cols={1} />
        <ComingUp h={d.h} />
        <Recent d={d} />
        <TopCategories d={d} />
      </div>
    </div>
  );
}
