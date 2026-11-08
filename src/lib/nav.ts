import {
  ArrowLeftRight,
  ChartPie,
  CreditCard,
  FileUp,
  Home,
  PiggyBank,
  Settings,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Mobile bottom bar (§9): Home · Activity · (+) · Budgets · Summary. (No in-app chat: Claude connects over MCP.) */
export const mobileTabs: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/", label: "Home", icon: Home },
    { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
  ],
  right: [
    { href: "/budgets", label: "Budgets", icon: PiggyBank },
    { href: "/summary", label: "Summary", icon: ChartPie },
  ],
};

/** Desktop sidebar (§9). */
export const sidebarSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/budgets", label: "Budgets", icon: PiggyBank },
      { href: "/summary", label: "Summary", icon: ChartPie },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/cash", label: "Cash", icon: Wallet },
      { href: "/debts", label: "Debts", icon: CreditCard },
      { href: "/investments", label: "Investments", icon: TrendingUp },
      { href: "/goals", label: "Goals", icon: Target },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/imports", label: "Imports", icon: FileUp },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
