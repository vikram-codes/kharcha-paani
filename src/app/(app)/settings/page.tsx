import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileUp, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { ChangePinForm } from "@/components/change-pin-form";

export const metadata: Metadata = { title: "Settings" };

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

      <Link href="/imports" className="flex items-center gap-3 rounded-2xl bg-surface-1 p-4 transition-colors duration-(--duration-fast) hover:bg-surface-2">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
          <FileUp className="size-[18px]" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium">Import a statement</span>
          <span className="block text-xs text-muted-foreground">Upload a PDF from Scotiabank, CIBC or Triangle</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

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
