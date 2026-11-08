"""Categorize parsed statement rows + Cashew history into one seed dataset.

Usage: python3 -I categorize.py rows.json cashew.csv out_dir [moneypro.csv]
"""
import csv, json, re, sys
from pathlib import Path
from collections import defaultdict

rows = json.load(open(sys.argv[1]))
cashew = list(csv.DictReader(open(sys.argv[2])))
OUT = Path(sys.argv[3]); OUT.mkdir(parents=True, exist_ok=True)
MONEYPRO = sys.argv[4] if len(sys.argv) > 4 else None

# (parent, sub, essential) essential: F=fixed, V=variable, ''=discretionary
CATS = {
 "rent": ("Housing", "Rent (incl. utilities)", "F"),
 "phone": ("Bills", "Phone & internet (Rogers)", "F"),
 "car_ins": ("Car", "Insurance", "F"),
 "student_loan": ("Debt payments", "Student loan EMI", "F"),
 "family_india": ("Family", "Send home (India)", "F"),
 "groceries": ("Food", "Groceries", "V"),
 "fuel": ("Car", "Fuel", "V"),
 "car_maint": ("Car", "Maintenance & parts", "V"),
 "tolls": ("Car", "Parking & tolls", "V"),
 "health": ("Health", "Pharmacy & medical", "V"),
 "cc_interest": ("Debt payments", "Credit card interest", "V"),
 "affirm": ("Debt payments", "Affirm (pay-later)", "F"),
 "eating_out": ("Food", "Eating out", ""),
 "gym": ("Health", "Gym & fitness", ""),
 "subs": ("Subscriptions", "Apps & streaming", "F"),  # owner, Nov 8: subscriptions are a fixed monthly cost
 "haircut": ("Personal care", "Haircut", ""),
 "toiletries": ("Personal care", "Toiletries & cosmetics", ""),
 "household": ("Home", "Household supplies", ""),
 "home": ("Home", "Furniture & electronics", ""),
 "shopping": ("Shopping", "Clothing & general", ""),
 "online": ("Shopping", "Online orders", ""),
 "entertainment": ("Fun", "Entertainment & games", ""),
 "career": ("Career & admin", "Courses, licences, fees", ""),
 "gifts_given": ("Gifts", "Gifts given", ""),
 "travel": ("Travel", "Flights & trips", ""),
 "misc": ("Misc", "Other", ""),
 # income
 "salary": ("Income", "Salary", "I"),
 "side": ("Income", "Side income (Uber)", "I"),
 "benefits": ("Income", "Government benefits & tax refunds", "I"),
 "gift_in": ("Income", "Gifts received", "I"),
 "income_other": ("Income", "Other income", "I"),
 "gic": ("Income", "GIC payouts", "I"),
 # transfers
 "cc_payment": ("Transfer", "Credit card payment", "T"),
 "savings_xfer": ("Transfer", "Chequing ↔ savings", "T"),
 # needs owner input
 "friend_payback": ("Reimbursement", "Paid back by friends", "R"),
 "unknown": ("Misc", "Unknown (owner doesn't recognise)", ""),
}

RULES = [  # (regex on description, category key)
 (r"CTFS\.COM/PAYMENTS|PAYMENT FROM|PAYMENT THANK YOU|MB-Transfer to \| Credit Card|MB-Bill payment \| CIBC", "cc_payment"),
 (r"MB-Transfer (to|from) \| 26112 04854 54", "savings_xfer"),
 (r"INTEREST CHARGES|FINANCE CHARGE CREDIT", "cc_interest"),
 (r"Payroll dep", "salary"),
 (r"Uber Holdings", "side"),  # occasional, never planned income
 (r"Provincial Payment|Canada Essentials", "benefits"),
 (r"Affirm", "affirm"),
 (r"Remitly", "student_loan"),
 (r"Highway 407", "tolls"),
 (r"ECONOMICAL INSURANCE", "car_ins"),
 (r"ROGERS", "phone"),
 (r"FRESHCO|WALMART\.CA|WAL-MART|COSTCO WHOLESALE|METRO \d|TAZZA FRESH|HOLTOM'S BAKERY", "groceries"),
 (r"COSTCO GAS|PETRO-CANADA|ESSO|MOBIL@|SHELL C|PIONEER STN|GASBAR", "fuel"),
 (r"MD AUTO SERVICE|CDN TIRE STORE", "car_maint"),
 (r"CRUNCH FITNES", "gym"),
 (r"SPORT CLIPS", "haircut"),
 (r"APPLE\.COM/BILL|Disney Plus|UBERONEMEM|Prime Video|Amazon\.ca Prime|ANTHROPIC|MICROSOFT\*STORE|PLAYSTATION", "subs"),
 (r"UBEREATS|McDonalds|TIM HORTONS|PIZZA|DOMINOS|OSMOW|HAKKA|KULCHA|India Paradise|RAJDHANI|TACO BELL|A&W|OLDSKOOL|TIN ROOF|CHURCH'S|BURGER KING|BIRYANIWALLA|Eggholic", "eating_out"),
 (r"DOLLARAMA|7 ELEVEN", "household"),
 (r"BEST BUY", "home"),
 (r"INTERNATIONAL CLOTHIER|WINNERS|JOMASHOP|ENCORE AUCTIONS|FRAGRANCEBUY", "shopping"),
 (r"AMZN Mktp|PAYPAL", "online"),
 (r"STROKERS BILLIARDS|K1 SPEED", "entertainment"),
 (r"SECURITY COURSE|SOLGEN PSIS|NAME-CHEAP", "career"),
 (r"DARLING HOME", "gifts_given"),
]

# Known e-Transfers resolved from cross-matching (amount+date) with card statements / Cashew
TRIANGLE_PAYMENTS = {("2026-08-03", -153.00), ("2026-08-08", -362.67), ("2026-08-17", -220.75),
                     ("2026-08-20", -200.00), ("2026-09-18", -483.12), ("2026-10-05", -200.00)}
RENT_GUESSES = {("2026-08-01", -650.00): "confirmed: rent $650 (before Sep, utilities were extra)",
                ("2026-08-05", -60.00): "confirmed: utilities on top of $650 rent",
                ("2026-09-02", -700.00): "confirmed: rent $700 incl. utilities from Sep",
                ("2026-10-01", -700.00): "confirmed: rent $700 incl. utilities"}

# Remitly sends to India. Only the scheduled EMI (from Oct 2026, counted as $510 CAD) pays
# the loan; everything else is money for home/family. Split = "key:amount|key:amount".
REMITLY = {
    ("2026-09-08", -206.88): ("family_india", "", "Owner: home bills / money for Indian bank account, before EMIs started"),
    ("2026-10-10", -520.00): (None, "student_loan:-510.00|family_india:-10.00", "Owner: first EMI ($510) + $10 sent home"),
    ("2026-10-22", -500.00): ("gifts_given", "", "Owner: gifts for family from first salary, not a loan payment"),
}

CUTOFF = "2026-08-01"  # Cashew is trusted before this date; statements after
out = []
for r in rows:
    desc = r["description"]
    key, note, conf = None, "", "rule"
    if "E-Transfer" in desc:
        k = (r["date"], r["amount"])
        if r["amount"] < 0 and k in TRIANGLE_PAYMENTS:
            key, note = "cc_payment", "e-Transfer matched to Triangle payment (same date & amount)"
        elif r["amount"] < 0 and k in RENT_GUESSES:
            key, note = "rent", RENT_GUESSES[k]
            conf = "confirmed" if "confirmed" in note else "guess"
        else:
            if r["amount"] < 0:
                key, conf, note = "unknown", "confirmed", "Owner confirmed they don't know what this was"
            else:
                key, conf, note = "friend_payback", "confirmed", "Owner confirmed: friends paying back"
    else:
        for pat, k in RULES:
            if re.search(pat, desc, re.I):
                key = k; break
    split = ""
    if (r["date"], r["amount"]) in REMITLY:
        rkey, split, note = REMITLY[(r["date"], r["amount"])]
        key, conf = rkey or "student_loan", "confirmed"
    if key is None:
        key, conf = "misc", "unmatched"
    if key == "groceries" and "WALMART.CA" in desc:
        note = "Walmart: groceries by default (Cashew history); may include household"
    parent, sub, ess = CATS[key]
    out.append({**r, "category_key": "" if split else key, "parent": parent, "sub": sub, "essential": ess,
                "confidence": conf, "note": note, "splits": split,
                "in_reports": r["date"] >= CUTOFF,  # pre-Aug card rows only feed balances
                "origin": "statement"})

# Cashew history Jan 1 - Jul 31 (trusted). Map to new categories.
CASHEW_MAP = {"Rent": "rent", "Rogers Bill": "phone", "Groceries": "groceries", "Dining": "eating_out",
              "Apps": "subs", "Haircut": "haircut", "Household": "household", "Home": "home",
              "Shopping": "shopping", "Presents": "gifts_given", "Medical": "health", "Misc": "misc",
              "Salary": "salary", "Business income": "side", "Tax return": "benefits"}
def cashew_key(c):
    cat, title = c["category name"], c["title"].lower()
    if cat == "Car":
        if title in ("gas", "fuel"): return "fuel"
        if title == "insurance": return "car_ins"
        if title == "parking": return "tolls"
        return "car_maint"
    if cat == "Health": return "gym" if title in ("gym", "gym bag", "macrofactor bundle", "whey protein", "pre-workout") else "health"
    if cat == "Gifts": return "benefits" if "tax" in title else "gift_in"
    if cat == "Misc" and c["income"] == "true": return "income_other"
    if cat == "Misc" and title in ("pcc", "celpip", "work permit", "domain", "dsa", "convocation", "trv", "spc"): return "career"
    return CASHEW_MAP[cat]

skipped = defaultdict(int)
for c in cashew:
    if not c["amount"]: skipped["scheduled/unpaid future"] += 1; continue
    if c["date"][:10] >= CUTOFF: skipped["Aug+ (replaced by statements)"] += 1; continue
    if c["category name"] == "Income" and c["title"] == "Starting Point": skipped["'Starting Point' opening balance (not income)"] += 1; continue
    key = cashew_key(c)
    parent, sub, ess = CATS[key]
    row = {"account": "cashew_legacy", "date": c["date"][:10], "amount": float(c["amount"]),
           "description": c["title"] or c["category name"], "source": "cashew",
           "category_key": key, "parent": parent, "sub": sub, "essential": ess,
           "confidence": "trusted", "note": c["note"], "in_reports": True, "origin": "cashew"}
    # Owner, Nov 8: rent is reported in the month it's FOR.
    if key == "rent" and row["date"] == "2026-01-01" and row["amount"] == -1300.0:
        out.append({**row, "amount": -650.0, "note": "January rent (paid with April's)"})
        row = {**row, "date": "2026-04-01", "amount": -650.0, "note": "April rent, paid Jan 1 as 'last month'"}
    elif key == "rent" and row["date"] == "2026-04-22" and row["amount"] == -700.0:
        row = {**row, "date": "2026-05-01", "note": "Paid Apr 22 when moving; counts for May (new place)"}
    out.append(row)

# Money Pro history Dec 2024 - Nov 2025 (owner's previous app).
MONEYPRO_MAP = {"Dining": "eating_out", "Groceries": "groceries", "Car: Fuel": "fuel", "Business income": "side",
                "Misc": "misc", "Car: Maintenance": "car_maint", "Car: Other": "car_maint", "Personal: Fitness": "gym",
                "Insurance": "car_ins", "Home: Rent": "rent", "Salary": "salary", "Utilities: Cell Phone": "phone",
                "Shopping: Clothing": "shopping", "Shopping: Other": "shopping", "Shopping: Books": "shopping",
                "Personal: Toiletries / Cosmetics": "toiletries", "Personal: Hair care": "haircut", "Apps": "subs",
                "Shopping: Electronics": "home", "Home: Furniture / Accessories": "home", "Household": "household",
                "Home: Other": "household", "Education": "career", "Car: Parking and tolls": "tolls",
                "Leisure": "entertainment"}
def moneypro_key(m):
    cat, desc, income = m["Category"], m["Description"], m["Transaction Type"] == "Income"
    if cat == "Other": return "benefits" if "tax" in desc.lower() else "gic"
    if cat == "Gifts": return "gift_in" if income else "gifts_given"
    if cat == "Misc" and desc == "Visa Appointment": return "career"
    if cat == "Misc" and "gift" in desc.lower(): return "gifts_given"
    return MONEYPRO_MAP[cat]
if MONEYPRO:
    for m in csv.DictReader(open(MONEYPRO, encoding="utf-8-sig")):
        kind, date = m["Transaction Type"], m["Date"][:10]
        if kind == "Opening Balance": skipped["Money Pro opening balance"] += 1; continue
        if date == "2025-12-31" and m["Category"] == "Misc": skipped["Money Pro year-end adjustment"] += 1; continue
        amt = float(m["Amount"].replace("$", "").replace(",", ""))
        key = moneypro_key(m)
        parent, sub, ess = CATS[key]
        out.append({"account": "moneypro_legacy", "date": date, "amount": amt if kind == "Income" else -amt,
                    "description": m["Description"] or m["Category"], "source": "moneypro",
                    "category_key": key, "parent": parent, "sub": sub, "essential": ess,
                    "confidence": "trusted", "note": "", "in_reports": True, "origin": "moneypro"})

out.sort(key=lambda x: (x["date"], x["account"]))
with open(OUT / "transactions.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["date", "posted", "account", "amount", "description", "parent", "sub",
                                      "essential", "category_key", "splits", "confidence", "note", "in_reports", "origin", "source"])
    w.writeheader()
    for x in out: w.writerow({k: x.get(k, "") for k in w.fieldnames})
json.dump({k: {"parent": v[0], "sub": v[1], "essential": v[2]} for k, v in CATS.items()},
          open(OUT / "categories.json", "w"), indent=1, ensure_ascii=False)
print("cashew skipped:", dict(skipped))
print("total rows:", len(out))
for x in out:
    if x["confidence"] in ("unmatched",): print("UNMATCHED", x["account"], x["date"], x["amount"], x["description"])
