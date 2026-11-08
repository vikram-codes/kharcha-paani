/**
 * Raw bank descriptor → readable merchant name (§5.3, first pass).
 * "TST-India Paradise Lon London ON Restaurants" → "India Paradise Lon"
 * "Point of sale purchase | Opos Remitly* K0C31 Vanco" → "Remitly"
 */
const PROVINCES = "AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|CA";
const CIBC_TAGS = /\s+(Restaurants|Retail and Grocery|Personal and Household Expenses|Transportation|Professional and Financial Services|Home and Office Improvement|Hotel, Entertainment and Recreation|Health and Education|Foreign Currency Transactions)$/i;

const KNOWN: [RegExp, string][] = [
  [/remitly/i, "Remitly"],
  [/uber\s*(canada)?\/?ubereats|ubereats/i, "Uber Eats"],
  [/uberonemem/i, "Uber One"],
  [/anthropic/i, "Claude"],
  [/apple\.com\/bill/i, "Apple"],
  [/amazon\.ca prime|prime video/i, "Amazon Prime"],
  [/amzn mktp|amazon/i, "Amazon"],
  [/disney plus/i, "Disney+"],
  [/rogers/i, "Rogers"],
  [/tim hortons/i, "Tim Hortons"],
  [/mcdonald/i, "McDonald's"],
  [/costco gas/i, "Costco Gas"],
  [/costco wholesale/i, "Costco"],
  [/wal-?mart/i, "Walmart"],
  [/petro-canada/i, "Petro-Canada"],
  [/economical insurance/i, "Economical Insurance"],
  [/payroll dep/i, "Payroll"],
  [/interest charges/i, "Interest charge"],
  [/payment thank you|paiement merci|ctfs\.com\/payments|payment from - \*/i, "Card payment"],
  [/e-?transfer/i, "Interac e-Transfer"],
  [/affirm/i, "Affirm"],
];

export function cleanMerchant(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  for (const [re, name] of KNOWN) if (re.test(s)) return name;
  let t = s
    .replace(/^(point of sale purchase|pos purchase|opos|withdrawal|deposit)\s*\|?\s*/gi, "")
    .replace(/^opos\s+/i, "")
    .replace(/^(TST|SQ|SP|PAYPAL|PP)\s*[-*]\s*/i, "")
    .replace(CIBC_TAGS, "")
    // trailing " LONDON ON", optionally followed by a (cut-off) CIBC tag like "Personal and Hous"
    .replace(new RegExp(`\\s+[A-Za-z][A-Za-z'-]*\\s+(${PROVINCES})(\\s+[A-Z][a-z].*)?$`), "")
    .replace(new RegExp(`\\s+(${PROVINCES})$`), "")
    .replace(/\s*#\s*\d+.*$/, "") // store numbers
    .replace(/\s+\d{3,}.*$/, "") // phone/store ids
    .replace(/\*\S+$/, "")
    .trim();
  if (!t) t = s;
  // SHOUTY CAPS → Title Case; leave mixed case alone.
  if (t === t.toUpperCase()) t = t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/'S\b/g, "'s");
  return t;
}
