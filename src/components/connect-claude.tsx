"use client";

import { useEffect, useState, useTransition } from "react";
import { Bot, Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createConnectorAction, listConnectorsAction, revokeConnectorAction } from "@/app/actions/editing";
import { cn } from "@/lib/utils";

type Token = Awaited<ReturnType<typeof listConnectorsAction>>[number];

/** Settings → Connect Claude: create a private connector link, see when it was used, revoke it. */
export function ConnectClaude() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const reload = () => listConnectorsAction().then(setTokens);
  useEffect(() => {
    listConnectorsAction().then(setTokens);
  }, []);

  const create = () =>
    start(async () => {
      const res = await createConnectorAction("Claude");
      if (!res.ok) return void toast.error(res.error);
      setLink(`${window.location.origin}/api/mcp/${res.token}`);
      setCopied(false);
      await reload();
    });

  const active = tokens?.filter((t) => !t.revoked_at) ?? [];
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "never");

  return (
    <section className="rounded-2xl bg-surface-1 p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lime-ink">
          <Bot className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-medium">Connect Claude</h2>
          <p className="text-xs text-muted-foreground">Ask about your money and log entries from your Claude app. Nothing is saved without your yes.</p>
        </div>
      </div>

      {link ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
          <p className="text-xs font-medium text-budget-high">Copy this now. It won&apos;t be shown again. Anyone with it can read your finances, so keep it private.</p>
          <code className="num break-all rounded-lg bg-background/60 p-2 text-[11px]">{link}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-lime text-sm font-semibold text-on-lime"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
          </button>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>On claude.ai: Settings → Connectors → Add custom connector.</li>
            <li>Name it Kharcha-Paani and paste the link as the URL.</li>
            <li>It then works in Claude on your Mac and iPhone too (same account).</li>
          </ol>
          <button type="button" onClick={() => setLink(null)} className="text-xs text-muted-foreground">
            Done
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={create} className="flex h-11 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-on-lime disabled:opacity-40">
          {busy ? <Loader2 className="size-4 animate-spin" /> : active.length ? "Create another link" : "Create connector link"}
        </button>
      )}

      {active.length > 0 && (
        <div className="mt-3 divide-y divide-border">
          {active.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 text-xs">
              <span className="flex-1 text-muted-foreground">
                <span className="text-foreground">{t.name}</span> · created {when(t.created_at)} · last used {when(t.last_used_at)}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  confirmRevoke === t.id
                    ? start(async () => {
                        const r = await revokeConnectorAction(t.id);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Link revoked: Claude can no longer connect with it");
                        setConfirmRevoke(null);
                        await reload();
                      })
                    : setConfirmRevoke(t.id)
                }
                className={cn("rounded-full px-2.5 py-1 font-medium", confirmRevoke === t.id ? "bg-budget-over text-white" : "bg-surface-2 text-budget-over")}
              >
                {confirmRevoke === t.id ? "Tap to revoke" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
