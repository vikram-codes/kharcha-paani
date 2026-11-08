"""Parse pdftotext -layout output of the owner's statements into normalized rows.

Sign convention: amount < 0 = money out of chequing / purchase on a card (debt up);
amount > 0 = money into chequing / payment or credit on a card (debt down).
Each parser verifies its rows against the statement's own totals.
"""
import json, re, sys
from pathlib import Path

TXT = Path(sys.argv[1])
OUT = Path(sys.argv[2])
MON = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}
AMT = r"-?[\d,]+\.\d\d"

def d(mon, day, year=2026):
    return f"{year}-{MON[mon[:3].title()]:02d}-{int(day):02d}"

def money(s):
    return round(float(s.replace(",", "").replace("$", "")), 2)

def cents(x):
    return int(round(x * 100))

rows, checks = [], []

def check(name, got, want):
    ok = abs(got - want) < 0.005
    checks.append((name, round(got, 2), want, ok))

# ---------- Scotiabank chequing ----------
def scotia_chequing(fname):
    lines = (TXT / fname).read_text().splitlines()
    opening = closing = None
    prev_bal = None
    out = []
    i = 0
    while i < len(lines):
        L = lines[i]
        m = re.search(r"Opening Balance on \w+ \d+, 2026\s+\$([\d,]+\.\d\d)", L)
        if m: opening = money(m.group(1))
        m = re.search(r"Closing Balance on \w+ \d+, 2026\s+\$([\d,]+\.\d\d)", L)
        if m: closing = money(m.group(1))
        m = re.match(r"^\s{20,}(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d+)\s{2,}(\S.*?)\s{2,}(" + AMT + r")\s+(" + AMT + r")\s*$", L)
        if m and "Opening Balance" not in L:
            mon, day, kind, amt, bal = m.groups()
            amt, bal = money(amt), money(bal)
            # detail line(s) follow; take the next non-empty line as description
            j = i + 1
            detail = []
            while j < len(lines) and len(detail) < 2:
                t = lines[j].strip()
                if t and not re.match(r"^\d{5,6}$|^\*\w+\*$|^SBSAV|^continued|^Page", t):
                    if re.match(r"^\s{20,}(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+\s", lines[j]):
                        break
                    detail.append(t)
                    if not re.match(r"^\d{5}", t) or True:
                        break
                j += 1
            base = prev_bal if prev_bal is not None else opening
            signed = amt if round(base + amt, 2) == bal else -amt
            assert round(base + signed, 2) == bal, (fname, L)
            prev_bal = bal
            out.append(dict(account="scotia_chequing", date=d(mon, day), amount=signed,
                            description=f"{kind.strip()} | {' '.join(detail)}".strip(" |"),
                            source=fname))
        if prev_bal is None and opening is not None:
            prev_bal = opening
        i += 1
    check(f"{fname} opening+Σ=closing", opening + sum(r["amount"] for r in out), closing)
    rows.extend(out)

# ---------- Scotiabank Scene+ Visa ----------
def scotia_visa(fname):
    text = (TXT / fname).read_text()
    out = []
    for m in re.finditer(r"^\s*(\d{3})\s+(\w{3}) (\d+)\s+(\w{3}) (\d+)\s+(.+?)\s{2,}(" + AMT + r")(-?)\s*$", text, re.M):
        seq, tm, td, pm, pd, desc, amt, cr = m.groups()
        a = money(amt)
        out.append(dict(account="scotia_visa", date=d(tm, td), posted=d(pm, pd),
                        amount=a if cr else -a, description=re.sub(r"\s{2,}", " ", desc), source=fname))
    debits = money(re.search(r"SUB-TOTAL DEBITS.*?\$([\d,]+\.\d\d)", text).group(1))
    credits = money(re.search(r"SUB-TOTAL CREDITS.*?\$([\d,]+\.\d\d)", text).group(1))
    check(f"{fname} debits", -sum(r["amount"] for r in out if r["amount"] < 0), debits)
    check(f"{fname} credits", sum(r["amount"] for r in out if r["amount"] > 0), credits)
    rows.extend(out)

# ---------- CIBC Costco Mastercard ----------
def cibc(fname):
    text = (TXT / fname).read_text()
    out = []
    for m in re.finditer(r"^\s*(\w{3}) (\d+)\s+(\w{3}) (\d+)\s+(?:Ý\s*)?(.+?)\s{2,}(" + AMT + r")\s*$", text, re.M):
        tm, td, pm, pd, desc, amt = m.groups()
        if tm[:3].title() not in MON: continue
        a = money(amt)
        desc = re.sub(r"\s{2,}", " ", desc).strip()
        is_payment = "PAYMENT THANK YOU" in desc
        out.append(dict(account="cibc_costco", date=d(tm, td), posted=d(pm, pd),
                        amount=a if is_payment else -a, description=desc, source=fname))
    m = re.search(r"Total balance\s+=\s+\$([\d,]+\.\d\d)", text); total_bal = money(m.group(1))
    prev = money(re.search(r"Previous balance\s+\$([\d,]+\.\d\d)", text).group(1))
    check(f"{fname} prev-Σ=balance", prev - sum(r["amount"] for r in out), total_bal)
    rows.extend(out)

# ---------- Triangle Mastercard ----------
def triangle(fname):
    text = (TXT / fname).read_text()
    out = []
    for m in re.finditer(r"^\s*(\w{3}) (\d+)\s+(\w{3}) (\d+)\s+(.+?)\s{2,}(" + AMT + r")(?=\s{2,}|\s*$)", text, re.M):
        tm, td, pm, pd, desc, amt = m.groups()
        if tm[:3].title() not in MON or pm[:3].title() not in MON: continue
        if re.search(r"^\d+\s+\d{4}\s", desc): continue  # CT store item-detail lines ("1 9619 BOSCH SPK PLG")
        a = money(amt)
        desc = re.sub(r"\s{2,}", " ", desc).strip()
        # payments/credits are printed negative; purchases/interest positive
        out.append(dict(account="triangle", date=d(tm, td), posted=d(pm, pd),
                        amount=-a, description=desc, source=fname))
    prev = money(re.search(r"Balance from your last statement\s+\$([\d,]+\.\d\d)", text).group(1))
    new = money(re.search(r"Your New Balance\s+\$([\d,]+\.\d\d)", text).group(1))
    check(f"{fname} prev-Σ=new", prev - sum(r["amount"] for r in out), new)
    rows.extend(out)

for f in ["Statements-scotiadebit1.txt", "Scotiadebit2.txt", "Scotiadebit3.txt"]: scotia_chequing(f)
for f in ["Statements.txt", "Statements-2-ScotiaCredit.txt", "Statements-scotiacr.txt"]: scotia_visa(f)
for f in ["Cibccredit1.txt", "Cibccredit2.txt"]: cibc(f)
for f in ["eStatement_August2026_EN.txt", "eStatement_September2026_EN.txt", "eStatement_October2026_EN.txt"]: triangle(f)

for c in checks: print(("OK  " if c[3] else "FAIL"), c[0], "got", c[1], "want", c[2])
print(len(rows), "rows")
OUT.write_text(json.dumps(rows, indent=1))
