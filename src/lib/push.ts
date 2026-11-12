import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "@/lib/database.types";
import type { Reminder, ReminderKind } from "@/lib/reminders";

/**
 * Sends phone reminders (#3) with web push. What to send is decided in
 * src/lib/reminders.ts; this delivers it to every device you turned on.
 */
type Db = SupabaseClient<Database>;

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

const PREF: Record<Exclude<ReminderKind, "test">, "notify_bills" | "notify_payday" | "notify_budget" | "notify_catchup"> = {
  bills: "notify_bills",
  payday: "notify_payday",
  budget: "notify_budget",
  catchup: "notify_catchup",
};

/**
 * Sends reminders to every device of the signed-in owner (`db` runs under
 * RLS), skipping kinds turned off and ones already sent. Returns how many
 * notifications reached a device.
 */
export async function deliver(db: Db, reminders: Reminder[]): Promise<number> {
  if (!pushConfigured() || !reminders.length) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const [{ data: prefs }, { data: subs }, { data: logged }] = await Promise.all([
    db.from("profiles").select("notify_bills,notify_payday,notify_budget,notify_catchup").maybeSingle(),
    db.from("push_subscriptions").select("id,endpoint,p256dh,auth"),
    db.from("notification_log").select("key").in("key", reminders.flatMap((r) => r.keys).slice(0, 500)),
  ]);
  if (!subs?.length) return 0;
  const done = new Set((logged ?? []).map((l) => l.key));
  const due = reminders.filter((r) => (r.kind === "test" || prefs?.[PREF[r.kind]] !== false) && (r.keys.length === 0 || r.keys.some((k) => !done.has(k))));

  let delivered = 0;
  for (const r of due) {
    const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.keys[0] ?? `test-${Date.now()}` });
    let reached = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600, urgency: "normal" });
        reached = true;
        delivered++;
        await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        // 404/410: the device unsubscribed or the app was removed; forget it.
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else console.error(`[push] ${r.kind} to ${new URL(s.endpoint).host} failed: ${code ?? ""} ${(e as Error).message}`);
      }
    }
    if (reached && r.keys.length) await db.from("notification_log").upsert(r.keys.map((key) => ({ key })), { onConflict: "user_id,key", ignoreDuplicates: true });
  }
  return delivered;
}
