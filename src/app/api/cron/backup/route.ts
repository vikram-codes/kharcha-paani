import { timingSafeEqual } from "node:crypto";
import { buildBackup } from "@/lib/backup";
import { emailBackup } from "@/lib/backup-email";
import { appBalances } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Weekly backup email (owner, Nov 11 2026), run by Vercel Cron every Sunday
 * (vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`; anything
 * else is refused. Runs with the service-role key, so the backup filters every
 * table by the owner's user_id.
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const db = adminClient();
  const today = todayISO();
  const { data: owners, error } = await db.from("profiles").select("user_id");
  if (error) return new Response(`Couldn't read profiles: ${error.message}`, { status: 500 });

  const results: string[] = [];
  for (const { user_id } of owners ?? []) {
    try {
      const { data: user } = await db.auth.admin.getUserById(user_id);
      const email = user?.user?.email;
      if (!email) throw new Error("no email on the account");
      const file = await buildBackup(db, user_id, today, await appBalances(db, user_id, today));
      await emailBackup(email, today, file);
      await db.from("profiles").update({ last_backup_emailed_at: new Date().toISOString() }).eq("user_id", user_id);
      results.push(`${user_id}: sent (${file.counts.transactions} transactions)`);
    } catch (e) {
      results.push(`${user_id}: failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const failed = results.some((r) => r.includes("failed"));
  console[failed ? "error" : "log"](`[backup] ${results.join(" | ")}`);
  return new Response(results.join("\n"), { status: failed ? 500 : 200 });
}
