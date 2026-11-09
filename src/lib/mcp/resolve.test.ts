import { describe, expect, it } from "vitest";
import { resolveAccount, resolveName } from "./resolve";

const cats = [
  { id: "g", name: "Groceries", parent: "Food", key: "groceries" },
  { id: "e", name: "Eating out", parent: "Food", key: "eating_out" },
  { id: "h", name: "Household supplies", parent: "Home", key: "household" },
  { id: "f", name: "Furniture & electronics", parent: "Home", key: "home" },
  { id: "s", name: "Student loan EMI", parent: "Debt payments", key: "student_loan" },
];
const accounts = [
  { id: "chq", name: "Scotiabank Chequing" },
  { id: "visa", name: "Scotiabank Scene+ Visa" },
  { id: "cibc", name: "Costco CIBC Mastercard" },
  { id: "tri", name: "Triangle Mastercard" },
];

describe("resolveName", () => {
  it("matches exact names, keys and words", () => {
    expect(resolveName("groceries", cats)).toMatchObject({ ok: true, id: "g" });
    expect(resolveName("eating_out", cats)).toMatchObject({ ok: true, id: "e" });
    expect(resolveName("household", cats)).toMatchObject({ ok: true, id: "h" });
    expect(resolveName("student loan", cats)).toMatchObject({ ok: true, id: "s" });
  });

  it("returns options instead of guessing when it's ambiguous", () => {
    const r = resolveName("home", cats);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.options).toEqual(["Home · Household supplies", "Home · Furniture & electronics"]);
  });
});

describe("resolveAccount", () => {
  it.each([
    ["Triangle", "tri"],
    ["canadian tire card", "tri"],
    ["costco", "cibc"],
    ["visa", "visa"],
    ["chequing", "chq"],
    ["debit", "chq"],
  ])("%s → %s", (q, id) => {
    expect(resolveAccount(q, accounts)).toMatchObject({ ok: true, id });
  });
});
