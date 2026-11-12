"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Droplet, LogOut, Plus } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { forgetDevice } from "@/lib/forget-device";
import { cn } from "@/lib/utils";
import { isActive, sidebarSections } from "@/lib/nav";
import { QuickAddSheet } from "./quick-add-sheet";

/** Desktop navigation (§9) — where the depth lives. */
export function Sidebar() {
  return (
    <Suspense fallback={<SidebarView pathname={null} />}>
      <SidebarWithPath />
    </Suspense>
  );
}

function SidebarWithPath() {
  return <SidebarView pathname={usePathname()} />;
}

function SidebarView({ pathname }: { pathname: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <Link href="/" className="flex items-center gap-2 px-3 pb-6">
        <span className="grid size-7 place-items-center rounded-lg bg-[#0a0a0a] ring-1 ring-border">
          <Droplet className="size-4 fill-lime text-lime" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          Kharcha<span className="text-lime-ink">-</span>Paani
        </span>
      </Link>

      <QuickAddSheet
        trigger={
          <button
            type="button"
            className="mb-5 flex h-10 items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98]"
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
              const active = pathname != null && isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-(--duration-fast)",
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

      <form action={signOut} onSubmit={forgetDevice} className="pt-3">
        <button
          type="submit"
          className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <LogOut className="size-4" strokeWidth={1.75} /> Sign out
        </button>
      </form>
    </aside>
  );
}
