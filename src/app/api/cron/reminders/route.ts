import { timingSafeEqual } from "node:crypto";
import { runAsUser, sendReminders, type ReminderRun } from "@/lib/data";
import { TIMEZONE } from "@/lib/dates";
import { adminClient, sessionFor } from "@/lib/supabase/admin";

/**
 * Phone reminders job (#3, owner, Nov 11 2026). Vercel Cron calls it at two
 * UTC hours each morning and two on Sunday afternoon (vercel.json), so one of
 * each pair lands at 9 am / 3 pm Toronto in both standard and daylight time.
 * It acts only at those Toronto hours; the notification log stops repeats.
 * `?run=morning|catchup` forces a run (testing; still needs the secret).
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function torontoNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(new Date());
  return { hour: Number(parts.find((p) => p.type === "hour")?.value), weekday: parts.find((p) => p.type === "weekday")?.value };
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const forced = new URL(request.url).searchParams.get("run");
  const { hour, weekday } = torontoNow();
  const run: ReminderRun | null =
    forced === "morning" || forced === "catchup" ? forced : hour === 9 ? "morning" : weekday === "Sun" && hour === 15 ? "catchup" : null;
  if (!run) return new Response(`Nothing to do at ${hour}:00 Toronto (${weekday}).`);

  const { data: owners, error } = await adminClient().from("profiles").select("user_id");
  if (error) return new Response(`Couldn't read profiles: ${error.message}`, { status: 500 });
  const results: string[] = [];
  for (const { user_id } of owners ?? []) {
    try {
      const s = await sessionFor(user_id);
      if (!s) throw new Error("couldn't sign in");
      const sent = await runAsUser(s.client as never, () => sendReminders(run));
      results.push(`${user_id}: ${run}, ${sent} sent`);
    } catch (e) {
      results.push(`${user_id}: ${run} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const failed = results.some((r) => r.includes("failed"));
  console[failed ? "error" : "log"](`[reminders] ${results.join(" | ")}`);
  return new Response(results.join("\n"), { status: failed ? 500 : 200 });
}
