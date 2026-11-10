import Link from "next/link";
import { Compass } from "lucide-react";

export const metadata = { title: "Not found" };

/** Unknown page (or a transaction month that doesn't exist). */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-[22px] bg-surface-1 text-muted-foreground">
        <Compass className="size-8" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Nothing here</h1>
        <p className="text-sm text-muted-foreground">This page doesn&apos;t exist.</p>
      </div>
      <Link href="/" className="flex h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-on-lime">
        Go home
      </Link>
    </div>
  );
}
