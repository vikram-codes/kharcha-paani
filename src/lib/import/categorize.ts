/**
 * First-pass category suggestions for imported rows (§4.3 step 4: rules first).
 * Ported from tools/seed/categorize.py. Returns a category key, or null when the
 * owner should decide (e.g. outgoing e-Transfers).
 */
const RULES: [RegExp, string][] = [
  [/CTFS\.COM\/PAYMENTS|PAYMENT FROM|PAYMENT THANK YOU|MB-Transfer to \| Credit Card|MB-Bill payment \| CIBC/i, "cc_payment"],
  [/MB-Transfer (to|from) \| 26112 04854 54/i, "savings_xfer"],
  [/INTEREST CHARGES|FINANCE CHARGE CREDIT|PURCHASE INTEREST/i, "cc_interest"],
  [/Payroll dep/i, "salary"],
  [/Uber Holdings/i, "side"],
  [/Provincial Payment|Canada Essentials|GST|CANADA CARBON/i, "benefits"],
  [/Affirm/i, "affirm"],
  [/Remitly/i, "student_loan"],
  [/Highway 407|PARKING|IMPARK|HONK/i, "tolls"],
  [/ECONOMICAL INSURANCE/i, "car_ins"],
  [/ROGERS/i, "phone"],
  [/FRESHCO|WALMART\.CA|WAL-MART|COSTCO WHOLESALE|METRO \d|TAZZA FRESH|HOLTOM'S BAKERY|NO FRILLS|FOOD BASICS|SOBEYS|LOBLAWS|ZEHRS/i, "groceries"],
  [/COSTCO GAS|PETRO-CANADA|ESSO|MOBIL@|SHELL C|PIONEER STN|GASBAR|ULTRAMAR/i, "fuel"],
  [/MD AUTO SERVICE|CDN TIRE STORE|CANADIAN TIRE #/i, "car_maint"],
  [/CRUNCH FITNES|GOODLIFE/i, "gym"],
  [/SPORT CLIPS|BARBER/i, "haircut"],
  [/APPLE\.COM\/BILL|Disney Plus|UBERONEMEM|Prime Video|Amazon\.ca Prime|ANTHROPIC|MICROSOFT\*STORE|PLAYSTATION|NETFLIX|SPOTIFY/i, "subs"],
  [/UBEREATS|UBER CANADA\/UBEREATS|McDonalds|TIM HORTONS|PIZZA|DOMINOS|OSMOW|HAKKA|KULCHA|India Paradise|RAJDHANI|TACO BELL|A&W|OLDSKOOL|TIN ROOF|CHURCH'S|BURGER KING|BIRYANIWALLA|Eggholic|STARBUCKS|SUBWAY|DOORDASH|SKIP/i, "eating_out"],
  [/DOLLARAMA|7 ELEVEN|SHOPPERS/i, "household"],
  [/BEST BUY/i, "home"],
  [/INTERNATIONAL CLOTHIER|WINNERS|JOMASHOP|ENCORE AUCTIONS|FRAGRANCEBUY|H&M|UNIQLO/i, "shopping"],
  [/AMZN Mktp|PAYPAL/i, "online"],
  [/STROKERS BILLIARDS|K1 SPEED|CINEPLEX/i, "entertainment"],
  [/SECURITY COURSE|SOLGEN PSIS|NAME-CHEAP/i, "career"],
  [/DARLING HOME/i, "gifts_given"],
];

export function suggestCategory(description: string, amountCents: number): string | null {
  if (/e-?Transfer/i.test(description)) return amountCents > 0 ? "friend_payback" : null;
  for (const [re, key] of RULES) if (re.test(description)) return key;
  return null;
}
