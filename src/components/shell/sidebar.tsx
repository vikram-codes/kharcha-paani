"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, sidebarSections } from "@/lib/nav";
import { QuickAddSheet } from "./quick-add-sheet";

/** Desktop navigation (§9) — where the depth lives. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <Link href="/" className="flex items-center gap-2 px-3 pb-6">
        <span className="grid size-7 place-items-center rounded-lg bg-lime text-sm font-bold text-on-lime">L</span>
        <span className="text-[15px] font-semibold tracking-tight">Ledger</span>
      </Link>

      <QuickAddSheet
        trigger={
          <button
            type="button"
            className="mb-5 flex h-10 items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-on-lime transition-transform duration-[var(--duration-fast)] active:scale-[0.98]"
          >
            <Plus className="size-4" strokeWidth={2.5} /> Add transaction
          </button>
        }
      />

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {sidebarSections.map((section, i) => (
          <div key={section.title ?? i} className="flex flex-col gap-0.5">
            {section.title && (
              <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-[var(--duration-fast)]",
                    active
                      ? "bg-sidebar-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4", active && "text-lime-ink")} strokeWidth={active ? 2.25 : 1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
