"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

/**
 * What shows when a page crashes (owner, Nov 10 2026): a plain note to go
 * check the code, the error's reference to find it in the Vercel logs, and a
 * retry.
 */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const e = error instanceof Error ? (error as Error & { digest?: string }) : null;
  // In production server errors arrive without their message; the digest matches the server log.
  const detail = e?.digest ? `Reference ${e.digest}` : e?.message;

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-[22px] bg-budget-over/15 text-budget-over">
        <TriangleAlert className="size-8" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Something broke</h1>
        <p className="text-sm text-muted-foreground">Vikram, check the codebase. This page hit an error it couldn&apos;t recover from.</p>
        {detail && <p className="num mt-1 rounded-lg bg-surface-1 px-3 py-2 text-left text-[11px] break-words text-muted-foreground">{detail}</p>}
        {e?.digest && <p className="text-[11px] text-muted-foreground">Search for it in the Vercel logs.</p>}
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        <Link href="/" className="flex h-11 items-center justify-center rounded-xl bg-surface-1 text-sm font-medium">
          Go home
        </Link>
        <button
          type="button"
          onClick={() => retry()}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-on-lime active:scale-[0.98]"
        >
          <RotateCw className="size-4" /> Try again
        </button>
      </div>
    </div>
  );
}
