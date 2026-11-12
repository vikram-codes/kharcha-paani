import { beforeEach, describe, expect, it } from "vitest";
import { MAX_OFFLINE_TRIES, checkLocalPin, forgetLocalPin, hashPin, rememberPin } from "./local-pin";

// A tiny localStorage for the node test environment.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
} as Storage;

describe("offline PIN check", () => {
  beforeEach(() => mem.clear());

  it("hashes the same PIN and salt the same way, and a different PIN differently", async () => {
    const salt = "00112233445566778899aabbccddeeff";
    expect(await hashPin("4821", salt)).toBe(await hashPin("4821", salt));
    expect(await hashPin("4822", salt)).not.toBe(await hashPin("4821", salt));
  });

  it("isn't available until a PIN was remembered online", async () => {
    expect(await checkLocalPin("4821")).toBe("unavailable");
  });

  it("accepts the remembered PIN and never stores it in plain text", async () => {
    await rememberPin("4821");
    expect([...mem.values()].join()).not.toContain("4821");
    expect(await checkLocalPin("4821")).toBe("ok");
  });

  it("stops after 5 wrong tries, even for the right PIN", async () => {
    await rememberPin("4821");
    for (let i = 1; i < MAX_OFFLINE_TRIES; i++) expect(await checkLocalPin("0000")).toBe("wrong");
    expect(await checkLocalPin("0000")).toBe("too-many");
    expect(await checkLocalPin("4821")).toBe("too-many");
  });

  it("forgets it on sign-out", async () => {
    await rememberPin("4821");
    forgetLocalPin();
    expect(await checkLocalPin("4821")).toBe("unavailable");
  });
});
