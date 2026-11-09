import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { ConnectClaude } from "@/components/connect-claude";

export const metadata: Metadata = { title: "Connect Claude" };

export default function ConnectClaudePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 md:max-w-xl">
      <BackButton fallback="/settings" label="Settings" />
      <h1 className="-mt-3 px-1 text-2xl font-semibold tracking-tight">Connect Claude</h1>
      <ConnectClaude />
    </div>
  );
}
