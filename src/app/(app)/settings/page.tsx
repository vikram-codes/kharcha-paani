import type { Metadata } from "next";
import Link from "next/link";
import { Bot, CalendarClock, ChartPie, ChevronRight, CreditCard, FileUp, LogOut, ShieldCheck, Tags, Target, TrendingUp, Wallet } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { ChangePinForm } from "@/components/change-pin-form";

export const metadata: Metadata = { title: "Settings" };

// Settings is a tab on phones (no sidebar there): everything that isn't a tab is reachable from here.
const MORE = [
  { href: "/summary", label: "Monthly summary", hint: "Income vs spending, categories, past months", icon: ChartPie },
  { href: "/bills", label: "Bills", hint: "Upcoming payments, add or stop bills", icon: CalendarClock },
  { href: "/goals", label: "Savings goals", hint: "Targets and monthly amounts", icon: Target },
  { href: "/cash", label: "Cash", hint: "Bank accounts, emergency fund, owed to you", icon: Wallet },
  { href: "/debts", label: "Debts", hint: "Cards, Affirm, student loan", icon: CreditCard },
  { href: "/investments", label: "Investments", hint: "Accounts and values you update", icon: TrendingUp },
  { href: "/settings/claude", label: "Connect Claude", hint: "Connector link for your Claude app", icon: Bot },
  { href: "/settings/categories", label: "Categories & rules", hint: "Rename, add, archive; \"always\" rules", icon: Tags },
  { href: "/imports", label: "Import a statement", hint: "PDF from Scotiabank, CIBC or Triangle", icon: FileUp },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-xl">
      <h1 className="px-1 text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="rounded-2xl bg-surface-1 p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
            <ShieldCheck className="size-[18px]" />
          </span>
          <div>
            <h2 className="text-sm font-medium">Emergency fund PIN</h2>
            <p className="text-xs text-muted-foreground">Needed to show the emergency fund on Home and Cash. 4–6 digits.</p>
          </div>
        </div>
        <ChangePinForm />
      </section>

      <nav aria-label="More" className="divide-y divide-border rounded-2xl bg-surface-1 px-4">
        {MORE.map(({ href, label, hint, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 py-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
              <Icon className="size-[18px]" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </nav>

      <form action={signOut}>
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-surface-1 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </form>
    </div>
  );
}
