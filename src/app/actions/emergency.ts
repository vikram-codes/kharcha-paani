"use server";

import { changeEmergencyPin, unlockEmergencyFund } from "@/lib/data";

export async function unlockEmergency(pin: string) {
  return unlockEmergencyFund(String(pin ?? ""));
}

export async function changePin(current: string, next: string) {
  return changeEmergencyPin(String(current ?? ""), String(next ?? ""));
}
