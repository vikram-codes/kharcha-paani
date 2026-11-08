import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** 4–6 digit PIN. */
export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);

/** Returns "scrypt:<salt hex>:<hash hex>". */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return ["scrypt", salt.toString("hex"), hash.toString("hex")].join(":");
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
