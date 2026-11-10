"use server";

import { changeEmergencyPin, hasOwnerPin, unlockEmergencyFund, verifyOwnerPin } from "@/lib/data";

export async function unlockEmergency(pin: string) {
  return unlockEmergencyFund(String(pin ?? ""));
}

export async function changePin(current: string, next: string) {
  return changeEmergencyPin(String(current ?? ""), String(next ?? ""));
}

/** App lock (after 10 min away): same PIN and lockout as the emergency fund. */
export async function unlockApp(pin: string) {
  const r = await verifyOwnerPin(String(pin ?? ""));
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error, noPin: r.noPin };
}

export async function appLockEnabled() {
  return hasOwnerPin();
}
