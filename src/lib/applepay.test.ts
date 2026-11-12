import { describe, expect, it } from "vitest";
import { addedNotice, matchCard, parseAmount, type CardAccount } from "./applepay";

describe("parseAmount", () => {
  it.each([
    [5.42, 542],
    ["5.42", 542],
    ["$5.42", 542],
    ["CA$1,234.56", 123456],
    ["5,42", 542],
    ["12", 1200],
    ["$ 0.99", 99],
  ])("reads %j", (input, cents) => expect(parseAmount(input)).toBe(cents));

  it.each([[""], ["abc"], [0], [-5], ["-5.00"], [null], [{}], ["1.2.3"]])("rejects %j", (input) => expect(parseAmount(input)).toBeNull());
});

describe("matchCard", () => {
  const accounts: CardAccount[] = [
    { id: "tri", key: "triangle", name: "Triangle Mastercard", last4: "8889", account_group: "debt_card" },
    { id: "cibc", key: "cibc_costco", name: "Costco CIBC Mastercard", last4: "9174", account_group: "debt_card" },
    { id: "visa", key: "scotia_visa", name: "Scotiabank Scene+ Visa", last4: "5771", account_group: "debt_card" },
    { id: "chq", key: "scotia_chequing", name: "Scotiabank Chequing", last4: "2089", account_group: "cash_bank" },
    { id: "sav", key: "scotia_savings", name: "Scotiabank Savings", last4: "5454", account_group: "cash_bank" },
  ];

  it.each([
    ["Triangle Mastercard", "tri"],
    ["CIBC Costco Mastercard", "cibc"],
    ["Scene+ VISA", "visa"],
    ["Scotiabank Debit", "chq"],
    ["Mastercard •••• 9174", "cibc"],
  ])("%s → %s", (name, id) => expect(matchCard(name, accounts)).toBe(id));

  it("can't tell an unknown card", () => {
    expect(matchCard("Amex Gold", accounts)).toBeNull();
  });
});

describe("addedNotice", () => {
  it("shows the amount, merchant, category and card", () => {
    expect(addedNotice({ cents: 542, merchant: "Tim Hortons", category: "Eating out", account: "Triangle Mastercard" })).toEqual({
      title: "Added $5.42 · Tim Hortons",
      body: "Eating out · Triangle. Tap to change.",
    });
    expect(addedNotice({ cents: 1999, merchant: "SQ *BLUE DOOR", category: null, account: "Scotiabank Scene+ Visa" }).body).toBe("No category yet · Scene+ Visa. Tap to pick one.");
  });
});
