import { Suspense } from "react";
import type { Metadata } from "next";
import { ImportFlow } from "@/components/imports/import-flow";
import { RecentImports } from "@/components/imports/recent-imports";
import { listImports } from "@/lib/data";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-3xl">
      <header className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import a statement</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rows already in the app are detected and skipped. Every import can be undone.</p>
      </header>
      <ImportFlow />
      <Suspense fallback={null}>
        <Recent />
      </Suspense>
    </div>
  );
}

async function Recent() {
  return <RecentImports imports={await listImports()} />;
}
