import { after } from "next/server";
import { parseAmount } from "@/lib/applepay";
import { notifyApplePayProblem, recordApplePay, runAsUser, sendReminders } from "@/lib/data";
import { applePayOwner } from "@/lib/mcp/auth";
import { sessionFor } from "@/lib/supabase/admin";

/**
 * Apple Pay → Kharcha-Paani (#9, owner, Nov 11 2026). The iOS Shortcuts
 * "Transaction" automation POSTs { amount, merchant, card } here after each
 * tap-to-pay purchase. The link can only add purchases.
 */
const reply = (status: number, message: string) => Response.json({ ok: status < 300, message }, { status });

export async function POST(request: Request, ctx: RouteContext<"/api/applepay/[token]">) {
  const { token } = await ctx.params;
  const userId = await applePayOwner(token);
  if (!userId) return reply(404, "Unknown or revoked Apple Pay link.");

  let body: Record<string, unknown> = {};
  try {
    const type = request.headers.get("content-type") ?? "";
    body = type.includes("json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return reply(400, "Send JSON with amount, merchant and card.");
  }
  const session = await sessionFor(userId);
  if (!session) return reply(500, "Couldn't sign in.");
  // Anything unusable gets a notification showing what arrived (a Shortcut field set up wrong).
  const problem = (message: string, status: number) => {
    after(() => runAsUser(session.client as never, () => notifyApplePayProblem(message, body)).catch(() => 0));
    return reply(status, message);
  };

  const amountCents = parseAmount(body.amount);
  if (!amountCents) return problem("The amount is missing or not a number.", 400);
  try {
    const saved = await runAsUser(session.client as never, () =>
      recordApplePay({ amountCents, merchant: String(body.merchant ?? ""), card: String(body.card ?? "") }),
    );
    if (!saved.duplicate) after(() => runAsUser(session.client as never, () => sendReminders("budget")).catch(() => 0));
    return reply(200, saved.duplicate ? "Already added." : `Added to ${saved.account}${saved.category ? ` · ${saved.category}` : ""}.`);
  } catch (e) {
    return problem(e instanceof Error ? e.message : "Couldn't save it.", 422);
  }
}
