import Link from "next/link";
import { ChevronRight, CreditCard, TrendingUp, Wallet } from "lucide-react";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

const tiles = [
  { href: "/cash", label: "Cash", icon: Wallet, hint: "Chequing, savings & emergency fund" },
  { href: "/debts", label: "Debts", icon: CreditCard, hint: "Cards, student loan & Affirm" },
  { href: "/investments", label: "Investments", icon: TrendingUp, hint: "Updated by you" },
] as const;

/**
 * Shell-only Home. The real layout (tiles + "left to spend" + upcoming bills)
 * is chosen by the owner from mockups in phase 4, and fed by Supabase.
 */
export default function HomePage() {
  return (
    <ScreenPlaceholder title="Home" phase={4}>
      <div className="grid gap-3 md:grid-cols-3">
        {tiles.map(({ href, label, icon: Icon, hint }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl bg-surface-1 p-4 transition-colors duration-(--duration-fast) hover:bg-surface-2 active:scale-[0.99]"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink group-hover:bg-surface-3">
              <Icon className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="num text-2xl font-semibold">—</span>
              <span className="truncate text-xs text-muted-foreground">{hint}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </ScreenPlaceholder>
  );
}
