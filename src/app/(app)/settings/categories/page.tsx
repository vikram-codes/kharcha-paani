import type { Metadata } from "next";
import { connection } from "next/server";
import { loadCategories } from "@/app/actions/categories";
import { CategoriesManager } from "@/components/categories-manager";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Categories & rules" };

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <Categories />
      </Reveal>
    </div>
  );
}

async function Categories() {
  await connection();
  return <CategoriesManager initial={await loadCategories()} />;
}
