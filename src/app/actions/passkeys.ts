"use server";

import { headers } from "next/headers";
import { passkeyRegister, passkeyRegistrationOptions, passkeyUnlock, passkeyUnlockOptions, removePasskey, type RelyingParty } from "@/lib/data";

/** Face ID (passkeys, owner, Nov 12 2026). Passkeys belong to the site's host name. */
async function relyingParty(): Promise<RelyingParty> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const id = host.replace(/:\d+$/, "");
  const proto = h.get("x-forwarded-proto") ?? (id === "localhost" ? "http" : "https");
  return { id, origin: `${proto}://${host}` };
}

type Fail = { ok: false; error: string; gone?: boolean };
const fail = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : "Face ID didn't work." });

export async function faceIdSetupOptions(pin: string) {
  try {
    return await passkeyRegistrationOptions(await relyingParty(), String(pin ?? ""));
  } catch (e) {
    return fail(e);
  }
}

export async function faceIdSetupFinish(response: unknown, device: string): Promise<{ ok: true; id: string } | Fail> {
  try {
    const r = await passkeyRegister(await relyingParty(), response, String(device ?? ""));
    return { ok: true, id: r.id };
  } catch (e) {
    return fail(e);
  }
}

export async function faceIdUnlockOptions(credentialId: string | null) {
  try {
    return await passkeyUnlockOptions(await relyingParty(), credentialId);
  } catch (e) {
    return fail(e);
  }
}

export async function faceIdUnlockFinish(response: unknown): Promise<{ ok: true } | Fail> {
  try {
    const okay = await passkeyUnlock(await relyingParty(), (response ?? {}) as { id?: unknown });
    return okay ? { ok: true } : { ok: false, error: "Face ID didn't match." };
  } catch (e) {
    return fail(e);
  }
}

export async function faceIdRemove(id: string): Promise<{ ok: true } | Fail> {
  try {
    await removePasskey(String(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
