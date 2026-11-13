"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { faceIdUnlockFinish, faceIdUnlockOptions } from "@/app/actions/passkeys";

/**
 * Face ID unlock on this device (owner, Nov 12 2026). The passkey's id is kept
 * on the phone so the lock screen knows Face ID is set up here; the passkey
 * itself lives in the iPhone's keychain, guarded by Face ID.
 */
const KEY = "kp:passkey";

export const faceIdSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential;

export function faceIdHere(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const hasFaceIdHere = () => faceIdSupported() && !!faceIdHere();

export function rememberFaceIdHere(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked: Face ID just won't be offered */
  }
}

export function forgetFaceIdHere() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

type Options = Parameters<typeof startAuthentication>[0]["optionsJSON"];
export type Prepared = { ok: true; options: Options } | { ok: false; why: "offline" | "gone" | "failed" };

/**
 * Fetches the Face ID request ahead of time. iPhone only shows the Face ID
 * prompt straight after a tap, so the tap mustn't wait for the network.
 */
export async function prepareFaceId(): Promise<Prepared> {
  const opts = await faceIdUnlockOptions(faceIdHere()).catch(() => null);
  if (!opts) return { ok: false, why: "offline" };
  if (!opts.ok) {
    const gone = "gone" in opts && !!opts.gone;
    if (gone) forgetFaceIdHere();
    return { ok: false, why: gone ? "gone" : "failed" };
  }
  return { ok: true, options: opts.options };
}

/**
 * Shows the Face ID prompt for prepared options and checks the result.
 * "cancelled": closed the prompt, or iPhone wanted a tap first (the same
 * options still work for the next try). Any other result spends the request,
 * so prepare a new one before trying again.
 */
export async function confirmFaceId(options: Options): Promise<"ok" | "cancelled" | "failed" | "offline"> {
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch {
    return "cancelled";
  }
  const done = await faceIdUnlockFinish(response).catch(() => null);
  if (!done) return "offline";
  return done.ok ? "ok" : "failed";
}
