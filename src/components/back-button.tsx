"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "‹ Back" for screens reached from somewhere else. Goes back in history when
 * you came from inside the app, otherwise to `fallback` (e.g. opened by link).
 */
export function BackButton({ fallback = "/", label = "Back", className }: { fallback?: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const internal = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
        if (internal && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className={cn("-ml-1 flex w-fit items-center gap-0.5 rounded-lg py-1 pr-2 pl-1 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground", className)}
    >
      <ChevronLeft className="size-4" /> {label}
    </button>
  );
}
