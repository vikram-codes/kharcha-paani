import { timingSafeEqual } from "node:crypto";
import { runAsUser, sendBackupEmail } from "@/lib/data";
import { adminClient, sessionFor } from "@/lib/supabase/admin";

/**
 * Monthly backup email (owner, Nov 12 2026; it was weekly). Vercel Cron calls
 * it on the 1st of each month in the morning (vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused. It runs as
 * the owner (RLS applies) and is sent once per month even if called again.
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const { data: owners, error } = await adminClient().from("profiles").select("user_id");
  if (error) return new Response(`Couldn't read profiles: ${error.message}`, { status: 500 });

  const results: string[] = [];
  for (const { user_id } of owners ?? []) {
    try {
      const s = await sessionFor(user_id);
      if (!s) throw new Error("couldn't sign in");
      const sent = await runAsUser(s.client as never, () => sendBackupEmail("monthly"));
      results.push(`${user_id}: ${sent.skipped ? "already sent this month" : "sent"}`);
    } catch (e) {
      results.push(`${user_id}: failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const failed = results.some((r) => r.includes("failed"));
  console[failed ? "error" : "log"](`[backup] ${results.join(" | ")}`);
  return new Response(results.join("\n"), { status: failed ? 500 : 200 });
}
