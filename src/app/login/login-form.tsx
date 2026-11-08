"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { signIn } from "@/app/actions/auth";

const field =
  "h-12 w-full rounded-xl bg-surface-1 px-4 text-[16px] ring-1 ring-border outline-none transition-shadow duration-(--duration-fast) placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-lime";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="sr-only" htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        placeholder="Email"
        defaultValue={state?.email}
        required
        className={field}
      />
      <label className="sr-only" htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        required
        className={field}
      />

      <p role="alert" aria-live="polite" className="min-h-5 px-1 text-sm text-budget-over">
        {state?.error}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-on-lime transition-transform duration-(--duration-fast) active:scale-[0.98] disabled:opacity-70"
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <>
            Sign in
            <ArrowRight className="size-4 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}
