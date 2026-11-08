"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, mobileTabs, type NavItem } from "@/lib/nav";
import { QuickAddSheet } from "./quick-add-sheet";

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium"
    >
      {active && (
        <motion.span
          layoutId="tab-active"
          className="absolute top-0 h-0.5 w-6 rounded-full bg-lime"
          transition={{ type: "spring", stiffness: 520, damping: 38 }}
        />
      )}
      <Icon
        className={cn(
          "size-[22px] transition-colors duration-(--duration-fast)",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
    </Link>
  );
}

/** Mobile-only bottom bar with a raised center + (Quick-add). */
export function BottomTabBar() {
  return (
    <Suspense fallback={<BottomTabBarView pathname={null} />}>
      <BottomTabBarWithPath />
    </Suspense>
  );
}

function BottomTabBarWithPath() {
  return <BottomTabBarView pathname={usePathname()} />;
}

function BottomTabBarView({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl pb-safe md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch px-2">
        {mobileTabs.left.map((t) => (
          <Tab key={t.href} item={t} active={pathname != null && isActive(pathname, t.href)} />
        ))}
        <div className="flex flex-1 items-start justify-center">
          <QuickAddSheet
            trigger={
              <motion.button
                type="button"
                aria-label="Quick add"
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 600, damping: 30 }}
                className="-mt-5 grid size-14 place-items-center rounded-2xl bg-lime text-on-lime shadow-[0_8px_24px_-6px_rgb(182_255_59/0.55)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Plus className="size-7" strokeWidth={2.5} />
              </motion.button>
            }
          />
        </div>
        {mobileTabs.right.map((t) => (
          <Tab key={t.href} item={t} active={pathname != null && isActive(pathname, t.href)} />
        ))}
      </div>
    </nav>
  );
}
