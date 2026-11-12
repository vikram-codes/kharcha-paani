"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createApplePayLink, revokeApplePayLink, setWalletCardAccount } from "@/lib/data";

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Something went wrong." });

/** A new Apple Pay link, as the full URL to paste into the Shortcut (shown once). */
export async function makeApplePayLink(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const token = await createApplePayLink();
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    revalidatePath("/settings");
    return { ok: true, url: `${proto}://${host}/api/applepay/${token}` };
  } catch (e) {
    return fail(e);
  }
}

export async function turnOffApplePay(): Promise<Result> {
  try {
    await revokeApplePayLink();
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setWalletCard(walletName: string, accountId: string): Promise<Result> {
  try {
    await setWalletCardAccount(walletName, accountId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
