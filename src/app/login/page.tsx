import type { Metadata } from "next";
import { Droplet } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 pt-[env(safe-area-inset-top)] pb-safe">
      {/* soft lime glow behind the mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[18%] left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-lime/10 blur-[110px]"
      />
      <div className="relative w-full max-w-[360px]">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <span className="grid size-16 place-items-center rounded-[22px] bg-[#0a0a0a] ring-1 ring-white/10">
            <Droplet className="size-8 fill-lime text-lime" />
          </span>
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">
              Kharcha<span className="text-lime-ink">-</span>Paani
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Where did the money go? Let&apos;s find out.</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
