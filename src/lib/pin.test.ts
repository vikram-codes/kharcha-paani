import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { hashPin, isValidPin, verifyPin } = await import("./pin");

describe("emergency PIN", () => {
  it("accepts 4–6 digits only", () => {
    expect(isValidPin("0000")).toBe(true);
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });

  it("verifies the right PIN and rejects others", () => {
    const h = hashPin("0000");
    expect(h.startsWith("scrypt:")).toBe(true);
    expect(verifyPin("0000", h)).toBe(true);
    expect(verifyPin("0001", h)).toBe(false);
    expect(verifyPin("0000", null)).toBe(false);
  });

  it("salts each hash", () => {
    expect(hashPin("1234")).not.toBe(hashPin("1234"));
  });
});
