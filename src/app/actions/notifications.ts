"use server";

import { removePushSubscription, savePushSubscription, sendReminders, setNotificationPref, type NotifyKind } from "@/lib/data";

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

export async function subscribeDevice(sub: { endpoint: string; p256dh: string; auth: string; device?: string }): Promise<Result> {
  try {
    await savePushSubscription(sub);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function unsubscribeDevice(endpoint: string): Promise<Result> {
  try {
    await removePushSubscription(endpoint);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setReminder(kind: NotifyKind, on: boolean): Promise<Result> {
  try {
    await setNotificationPref(kind, on);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Sends "Reminders are on" to every device. */
export async function sendTestReminder(): Promise<{ ok: true; delivered: number } | { ok: false; error: string }> {
  try {
    return { ok: true, delivered: await sendReminders("test") };
  } catch (e) {
    return fail(e) as { ok: false; error: string };
  }
}
