import { describe, expect, it } from "vitest";
import { cleanMerchant } from "./merchant";

describe("cleanMerchant", () => {
  it.each([
    ["TST-India Paradise Lon London ON Restaurants", "India Paradise Lon"],
    ["Point of sale purchase | Opos Remitly* K0C31 Vanco", "Remitly"],
    ["UBER CANADA/UBEREATS TORONTO", "Uber Eats"],
    ["TIM HORTONS #2406 LONDON ON", "Tim Hortons"],
    ["WAL-MART #3049 LONDON ON Retail and Grocery", "Walmart"],
    ["BIRYANIWALLA CAMBRIDGE", "Biryaniwalla Cambridge"],
    ["OLDSKOOL RASOI BRAMPTON ON", "Oldskool Rasoi"],
    ["THE DARLING HOME FOR K MILTON ON Personal and Hous", "The Darling Home For K"],
    ["Dining", "Dining"],
    ["CTFS.COM/PAYMENTS OAKVILLE ON", "Card payment"],
  ])("%s → %s", (raw, clean) => {
    expect(cleanMerchant(raw)).toBe(clean);
  });
});
