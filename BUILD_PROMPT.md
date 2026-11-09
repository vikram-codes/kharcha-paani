# Build prompt: personal expense tracker

You are building a personal finance app for one person (the owner). They are a developer and will use it every day, mostly on an iPhone and sometimes on a Mac. Every decision below was confirmed with the owner. Where something says **ASK**, stop and ask the owner before building it, and don't guess.

---

## 1. Product summary

A fast, beautiful, mobile-first PWA that answers two questions:

1. **Where do I stand?** How much cash I have, how much I owe (credit cards, student loan) and what my investments are worth.
2. **How much can I still spend this month?** This is the **discretionary money** left after fixed and essential costs and savings.

Three principles hold across the whole app:

> **Simple at first glance, as detailed as possible when drilled into.** The overview is calm and readable in a second. Each tap deeper reveals more data.

> **The phone is for checking and quick actions. The web (desktop) is where the depth lives.** Mobile screens stay simple. Dense tables, multi-chart analysis and bulk editing are designed for wide screens.

> **AI does the heavy lifting.** The owner can describe spending in plain language and Claude files it in the right place (§7.11).

---

## 2. Tech stack (decided)

| Area | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript strict |
| UI | Tailwind CSS + shadcn/ui as a base, heavily customized (see §9). No stock look. |
| Backend | Supabase: Postgres, Auth, Row Level Security on every table |
| Auth | Email + password (Supabase Auth). Single user. |
| Environments | Two cloud Supabase projects: `expense-dev` and `expense-prod`. No local Docker. Schema changes go through SQL migration files in the repo (Supabase CLI `db push`), never by hand in the dashboard. |
| Hosting | Vercel |
| Repo | Git + private GitHub repo. Real financial files never go into git (see §4.1). |
| Tests | Vitest for parsers, duplicate detection, transfer matching, balances, paydays, and all money and budget math |
| AI | Claude API. `claude-haiku-5-5` for categorization and PDF extraction, `claude-sonnet-5-5` for chat and summaries. Calls happen server-side only. The API key never reaches the client. |
| MCP | The app exposes an MCP server (§7.11) so the owner's own Claude apps can read their finances and propose changes to them. |
| PWA | Installable from Safari or Chrome on iOS, offline shell, web push (iOS 16.4+, installed to home screen) |
| Widget | Scriptable (iOS) script reading a read-only aggregate endpoint. Built **after** the main app works. |

Rules:
- Money is stored as **integer cents** (`bigint`). Never use floats for money. Currency is **CAD only**.
- Dates are stored as `date` in the `America/Toronto` timezone. Budget months are **calendar months**.
- Even with one user, every table has `user_id` and RLS policies `user_id = auth.uid()`.
- The Supabase service-role key is only used server-side.
- No receipt photos, no tags and no credit-card rewards tracking. Rewards are a bonus and are ignored.

---

## 3. Money structure

The app has three top-level groups. Accounts are grouped by **what the money is**, not by bank brand.

### 3.1 Cash: money the owner actually has
| Sub-group | Accounts | Notes |
|---|---|---|
| **Bank accounts** | Scotiabank chequing (…2089, main account: salary in, bills and card payments out), Scotiabank savings (…5454) | As of Nov 7, 2026 all money is in chequing, and savings is $0 |
| **Emergency fund** | **Simplii Financial** savings account | **Hidden behind a PIN** (decided Nov 8, 2026). Shown as `••••`; tapping asks for the PIN (keypad sheet). Only after the PIN checks out is the amount fetched from the server, shown, and **added to the Cash total** (Home and /cash). Hides again on tap or reload. PIN: 4–6 digits, salted scrypt hash in `profiles`, 5 wrong tries → locked 5 min, changed in Settings. Dev PIN: 0000. Starts at $0. |

- The Cash total on the Home screen **never subtracts debt**.

### 3.2 Debts: money the owner owes
| Debt | Balance source |
|---|---|
| Scotiabank Scene+ Visa | Calculated from imported transactions. Can be reconciled against the statement balance. |
| Costco CIBC Mastercard | Same |
| Triangle Mastercard (Canadian Tire) | Same |
| Student loan (India) | Owed to an Indian bank: **₹30,00,000 (30 lakh)** as of Nov 2026, after the first EMI of **₹34,000** in Oct 2026. **Paid $550 CAD on the 10th of every month through Remitly from chequing**, so every `Remitly` transaction is a student loan payment (essential fixed). The **one exception to CAD-only:** store this balance in **INR** and show it in CAD using an editable exchange rate (starting at ₹61.82 per CAD, from 34,000 ÷ 550; about $48,500 CAD). The owner updates the INR balance manually now and then, because of interest. |
| Affirm (Sep plans) | Two 3-month plans paid from chequing. **One final payment of each:** $24.90 (~Nov 16) and $101.04 (~Nov 20, 2026), then close at $0. |
| Affirm (walk pad) | **$50/month × 6** for a walk pad (treadmill), Nov 30, 2026 → Apr 30, 2027. Starts at $300 and closes automatically at $0. |

**Debts total excludes the student loan (decided Nov 8, 2026).** The Debts tile and total = credit cards + Affirm only. The Debts section has a separate **Student loan** entry that opens its own page:
- A big rounded ring (app theme) showing the **loan left in CAD** as the big number, with **amount paid so far** above it. The ring = left ÷ (left + paid), so it shrinks as payments are made.
- **Interest: 9.5% a year, compounded monthly.** On the 1st of each month the balance grows by balance × 9.5% ÷ 12 (≈ $384 on $48.5k). Show this month's interest, how much of the $550 goes to principal, and the projected payoff date.
- **Later:** show the total interest accumulated since the loan was approved (needs the loan's start date and original amount from the owner).
- A loan or Affirm payment from chequing is spending (essential fixed) **and** is linked to its debt account (`transactions.pays_account_id`) so that debt goes down.

**Student loan facts (owner, Nov 8, 2026):** sanctioned ₹24L at 9.5% from the start; ₹18L disbursed Jan 2025, the remaining ₹6L in Jul 2025. First EMI was Oct 2026 (₹34,070). **The EMI is counted as $510 CAD/month**; any extra in a Remitly transfer is "Send home (India)" (Family, fixed). Remitly transfers before Oct 2026 were money for home, and the Oct 22, 2026 $500 was gifts for family. These facts make the later "total interest since approval" figure possible.

**Report month vs. payment date (decided Nov 8, 2026).** A transaction or split line can carry a `report_date`: summaries and budgets count it in that month, while lists keep the real payment date (shown as "paid <date>"). Used for rent paid ahead (and anything similar). The `ledger_lines` view returns one row per transaction or split line with `report_on`.

**2025 corrections (owner):** the May 31, 2025 Money Pro "Misc" $1,913.35 = May rent $600 + August rent $600 + May car insurance $276 + misc $437.35. The Aug 26, 2025 rent $1,300 counts for September. Money Pro stops Nov 8, 2025 and Cashew starts Jan 1, 2026; Nov 9 – Dec 31, 2025 wasn't tracked (the Dec 31 $1,700 "Misc" is an adjustment, excluded).

**Owed to the owner:** $340 from a friend for food (split between eating out and groceries unknown), stored as an open `shared_debts` row without a transaction. When it's repaid it's a friend payback (not income).

**Rent history (owner):** Jan–Apr 2026 $650 incl. utilities (only Mar had $19 extra); Jan's $1,300 = Jan + Apr (Apr is reported in Apr). New place from May: $650 + utilities; the $700 paid Apr 22 counts for May (May shows both). $700 incl. utilities from Sep. One month's rent is held as a deposit.

**Which account pays what (confirmed from Aug–Oct data):** everything goes on a credit card (raises Debts, doesn't touch Cash) **except rent, Affirm and the student loan (Remitly)**, which come out of chequing. Quick-add defaults follow this. Tax refunds and government benefits are deposited to chequing, so they're part of Cash.

### 3.3 Investments
- Accounts the owner names (e.g. TFSA, RRSP, brokerage). The **value is updated manually** whenever the owner wants.
- Each update is stored as a dated snapshot, so the value can be charted over time.
- Contributions from chequing are transfers (Cash → Investments), not spending.

**Built Nov 8, 2026:** `/investments`: add an account (name, where, current value), "Update value" saves a dated snapshot, sparkline + change since first value, remove = archive (history kept). The total feeds the Home tile.

### 3.4 How money moves (the accounting rules)
| Event | Spending? | Effect on balances |
|---|---|---|
| Purchase on a credit card | **Yes**, in its category, on the purchase date | Card debt ↑ |
| Purchase from chequing (debit, e-Transfer, bill) | **Yes** | Chequing ↓ |
| Paying a credit card from chequing | **No.** It's a transfer, so spending isn't counted twice. | Chequing ↓, card debt ↓ |
| Student loan payment (Remitly) from chequing | **Yes**, essential fixed "Student loan" | Chequing ↓, loan balance ↓ |
| Affirm payment from chequing | **Yes**, essential fixed "Affirm" | Chequing ↓, Affirm balance ↓ |
| Occasional Uber driving payout | Income ("Side income"), **never part of planned income** | Chequing ↑ |
| Moving money chequing ↔ savings / emergency / investments | No (transfer) | Moves between groups |
| Paycheque | Income | Chequing ↑ |
| Refund on a card or account | Reduces spending in its category, in the month it arrives | Debt ↓ or cash ↑ |
| Friend repays their share | Settles the receivable (§6), not income | Cash ↑ |

Opening balances: when an account is created, the owner enters its balance as of a date, and imported transactions carry it forward from there. Add a "reconcile" action (enter the real balance, and the app records an adjustment) for when things drift.

---

## 4. Getting data in

### 4.1 Starting data (one-time). **Already prepared.**
The starting data has already been extracted, checked against every statement's totals, categorized, and reviewed with the owner:

| File (git-ignored) | Contents |
|---|---|
| `statements/` | Originals: Cashew CSV + 11 PDF statements (Scotia chequing Aug–Oct, Scotia Visa to Nov 5, CIBC Costco Sep–Oct 18, Triangle Jul 19–Oct 18) |
| `data/seed/transactions.csv` | 704 rows: 437 from Cashew (Jan 1–Jul 31, 2026, trusted) + 267 from statements (Aug 1 onwards). Columns: date, posted, account, amount (negative = money out / card purchase), description, parent, sub, essential (F/V/blank/I/T/R), confidence, note, `in_reports`, origin |
| `data/seed/accounts.json` | Accounts with last known balances, plus income settings |
| `data/seed/categories.json` | The category tree with essential types |
| `tools/seed/*.py` | The Python parsers that produced the above. Port their logic to TypeScript for the in-app importers, and reuse the statements as test fixtures. |

Rules baked into the seed (keep them in the app):
- Cashew is the source of truth **before Aug 1, 2026**, and statements from Aug 1 on. Card rows dated before Aug 1 have `in_reports = false`: they only set balances, so spending isn't counted twice.
- Cashew's "Starting Point" row is an opening balance, not income. Cashew's "Wallet" account becomes a `legacy` account that doesn't affect balances.
- Chequing "Interac e-Transfer" withdrawals that match a Triangle payment (same date and amount) are card payments (transfers).
- Incoming e-Transfers are friends paying the owner back (essential = `R`). They aren't income and aren't spending.
- Rent: $650 + utilities before Sep 2026, and **$700 including utilities** from Sep 2026.
- Load the seed into `expense-dev` first, check that balances and month totals match, then load it into `expense-prod`.
- Data after each statement's end date (to Nov 7, 2026) will be entered manually by the owner while testing the app.
- **Updated Nov 8, 2026: cards are anchored to their latest statements** (Triangle $2,995.00 and CIBC $1,579.50 on Oct 18; Scene+ Visa $0.00 on Nov 5), plus CIBC payments made after its statement ($200 e-Transfer sent Oct 17, $229.24 on Oct 26). The owner's Nov 7 banking-app balances are kept as `accounts.reported_balance_cents`, and Debts shows **"Still to add"** = reported − computed until the missing purchases are entered (Triangle $2,675.00, CIBC $1,579.74 at the time). This replaces the reconciliation-adjustment approach below.
- **Current balances (Nov 7, 2026) come from the owner, not the statements:** Triangle $5,670, CIBC $2,730, Scotia Visa $0. The gap between the statements and these balances is seeded as **reconciliation adjustments** (`accounts.json → reconciliations`; it includes an Oct return flight to India). As the owner enters the real transactions, the adjustment **shrinks automatically**, so the balance stays correct the whole time.

Ongoing importers still need to handle CSV downloads from each bank. When the first one is uploaded, read its exact columns. Don't guess formats.

**Built Nov 8, 2026: PDF statement import** (`/imports`, owner chose built-in parsers over Claude extraction). pdf.js text → column layout (`src/lib/import/pdf-text.ts`) → per-bank parsers (`statements.ts`) checked against each statement's own totals → duplicate detection (exact = skipped, same amount within ±3 days = "possible", fingerprints block re-imports) → rule-based category suggestions → review (tick rows, pick categories) → import, undoable. `node scripts/verify-statements.mts` re-checks all PDFs in `statements/` (all 11 match the seed exactly). The owner has no bank CSVs; CSV import can be added when they download some.

### 4.2 Import sources (ongoing)
1. **CSV upload**, with one parser per source: Scotiabank chequing, Scotiabank Scene+ Visa, CIBC Costco Mastercard, Triangle Mastercard, Cashew. Detect the source automatically from the headers, and let the owner override it.
2. **PDF statement upload**, with extraction by Claude into the same normalized row format. Always goes through review.
3. **Manual quick-add** (§7.3).
4. **Chat entry** in plain language (§7.11).

### 4.3 Import pipeline
1. Parse the file into normalized rows: date, amount_cents (negative = money out), raw description, account.
2. **Duplicate detection:** compute a fingerprint from account + date + amount + normalized description, plus an occurrence index for identical same-day rows. Skip exact duplicates, and flag near-duplicates (pending vs. posted, ±2 days, same amount) for review. Also match against manual and chat entries, so a purchase logged by hand isn't duplicated when the statement arrives.
3. **Transfer detection:** card payments from chequing are paired with the matching payment credit on the card, and moves between the owner's own accounts are paired as well. Follow §3.4.
4. **Categorization:** apply **rules first** (§5.2), and send only the unmatched rows to Claude in batches. Claude returns category, cleaned merchant name and a confidence score.
5. **Review screen** (built for desktop, usable on mobile): incoming rows showing the suggested category and confidence. Low-confidence rows, near-duplicates and transfer guesses are highlighted. The owner can bulk-edit, split, mark rows as transfers, then confirm. Nothing is saved until confirmed.
6. Corrections become rules (§5.2).
7. Keep an `imports` record (file, source, row counts, status) so a whole import can be undone.

---

## 5. Categories, rules, merchants

### 5.1 Categories
- Two levels: parent → subcategory (e.g. Food → Groceries, Food → Eating out).
- Each category has: name, parent, kind (`expense` | `income` | `transfer`), **essential type** (`fixed` | `variable` | none = discretionary), color, icon (Lucide), sort order, archived.
- **Seed essentials (confirmed by the owner):**

| Essential, fixed | Essential, variable |
|---|---|
| Rent (includes utilities) | Groceries |
| Student loan payment | Fuel |
| Car insurance | Car maintenance (oil, tires, repairs, parking) |
| Phone & internet (Rogers) | Health / pharmacy |
| Affirm payments | Credit card interest |

- **All subscriptions are discretionary** (Claude, Apple storage, Prime, Disney+, Uber One, Microsoft and so on). The owner confirmed none are essential.
- Everything else is **discretionary** (eating out, shopping, entertainment, subscriptions, travel, and so on).
- Seed a sensible Canadian default set of discretionary categories, then **ASK** the owner to review them.

### 5.2 Rules
- Match on cleaned merchant or a raw-description pattern (contains / regex), optionally limited by account or amount range, and set the category (plus optional merchant name and transfer flag).
- When the owner corrects a category, offer "Always categorize *Tim Hortons* as Coffee?" and create the rule.
- A rules management screen (desktop), where rules can be reordered by priority.

**Built Nov 8, 2026 (phase B):** changing a transaction's category offers "Always put <merchant> in this category" (+ "also change past ones"): saved as a `rules` row on the cleaned merchant; statement imports apply owner rules before the built-in suggestions. Settings → Categories & rules: list/delete rules, rename / add (under a group, with essential type) / archive categories (archived ones leave pickers, keep history). Transaction edit sheet → Split: lines with category + amount; typing a line rebalances the first line so it always adds up; Remove split goes back to one category.

### 5.3 Merchants
- Clean raw descriptors: `SQ *TIM HORTONS #1234 TORONTO ON` → `Tim Hortons`. The owner can rename a merchant, and the new name applies everywhere.

---

## 6. Transactions

Fields: account, date, amount_cents, raw description, merchant, category, note, source (import / manual / chat), transfer flag + paired transaction, refund link (optional), created/updated.

- **Notes:** free text on any transaction.
- **Split across categories:** one transaction → several category lines whose amounts must add up to the total exactly. Reports use the split lines.
- **Shared with friends / owed back:** part of a transaction can be marked "owed by <person>". That part is excluded from the owner's spending and tracked as a receivable. When the friend repays (e.g. an incoming e-Transfer), match it and mark the debt settled. Add an "Owed to me" view listing each person's balance.
- **Refunds:** a refund reduces spending in its category in the month the refund arrives. It can optionally be linked to the original purchase.
- **Upcoming scheduled payments:** for each confirmed recurring bill (§7.7), show **only its next occurrence** as a **greyed-out, not-yet-real row** at the top of the transaction list, on its due date. Don't list future months. When the real transaction arrives, it replaces the greyed row, and the following occurrence appears.

---

## 7. Features (v1)

### 7.1 Income & paydays
- Employer: **Info-Tech Research Group** (permanent, full-time; Nickson Security has ended). Net biweekly paycheque: **$2,068.00** (confirmed take-home). First full payday: **Fri Nov 6, 2026**. Occasional Uber driving is never counted in planned income. Paydays repeat every 14 days: Nov 20, Dec 4, Dec 18, Jan 1 2027, …
- **Holiday rule (confirmed): a payday on a statutory holiday or weekend moves to the business day before.** Fri Jan 1, 2027 is paid Thu Dec 31, 2026, so **Dec 2026 is the first 3-paycheque month** (Dec 4, 18, 31). The next ones are **Jul 2027 and Dec 2027**. Calculate these with Ontario statutory holidays, never hardcode them, and let the owner mark the actual date a paycheque arrived.
- **The 3rd paycheque in a month goes straight to savings.** Prompt to record the chequing → savings transfer (or detect it). It never enlarges the discretionary pool.
- The owner can edit the paycheque amount and date in Settings (raises, job changes).

### 7.2 Discretionary money (core concept)
For each calendar month:

```
planned_income      = 2 × net biweekly paycheque               (always 2; a 3rd goes to savings)
essential_reserved  = Σ budgets of essential categories        (fixed + variable; the budget, not actual spending)
savings_target      = Σ monthly savings-goal contributions
discretionary_pool  = planned_income − essential_reserved − savings_target

discretionary_spent = actual spending in discretionary categories
                    + Σ max(0, actual − budget) for each essential category  (overspending essentials eats into fun money)
discretionary_left  = discretionary_pool − discretionary_spent
```

- **Unused budget doesn't roll over.** Whatever isn't spent simply stays in chequing as real cash. At month end, show a short "You came in $X under budget, move it to savings?" prompt with a one-tap transfer record. Underspending an essential never adds to the discretionary pool.
- Every month starts fresh.

### 7.3 Budget colors (used everywhere: bars, donuts, chips, widget)
| Used | Color |
|---|---|
| < 50% | Green (the lime accent) |
| 50% – < 80% | Yellow |
| 80% – < 100% | Dark orange |
| ≥ 100% | Red |

### 7.4 Home screen
**Mobile, updated Nov 8, 2026: Cash-first.** Greeting, then a **Cash hero card** (total, chips per account, emergency fund behind the PIN, "$X owed to you" greyed, next payday), then **"Spent in <month>" of the $3,000 budget** (bar, left, days left → this month's Summary), then Debts and Investments tiles, then Coming up. Money figures count up on load.

_Earlier version (superseded):_ **Mobile (decided Nov 8, 2026 from mockups: C's card shape + B's tiles; no bright-filled surfaces):**
1. **Hero card** (dark surface, not lime-filled): the big number is **total spent this month** (all expense categories, essentials included; transfers and friend paybacks excluded). Under it: "of $X planned income", a thin progress bar colored per §7.3, and a footer with days left in the month on the left and the **next payday on the right**. No "$/day" figure. **Tapping it opens this month's Summary** (§7.10): a full income-vs-expenses page with month navigation.
2. **Three big tiles** (B style): Cash, Debts, Investments, each with its total and a one-line breakdown. Cash = bank accounts; the emergency fund stays masked (`••••`).
3. **Coming up:** the next 3 upcoming payments (greyed, §6).

**Desktop:** the same overview, plus room for charts, recent transactions and budget status side by side.

Tapping a tile opens its section:
- **Cash:** Bank accounts (chequing, savings) and Emergency fund (hidden by default, labeled with its bank). Balances, a trend chart and recent activity.
- **Debts:** each card and the student loan, with balance, trend, and payments made. A total-debt trend, which should go down.
- **Investments:** each investment account, an "Update value" action, a value history chart, and contributions.

### 7.5 Quick-add (the center + button)
- Opens straight to an **amount keypad**, then a grid of recent and frequent categories, then save. The target is **under 5 seconds**.
- **"Paid from" dropdown with 4 options: Scotiabank chequing, Scene+ Visa, Costco CIBC, Triangle. It always defaults to the last account used** (`profiles.last_account_id`, saved on every add). Also on the sheet: Expense / Money in toggle, date (today), note. Later: merchant, split, friend owes.
- Bottom sheet on phones, centered dialog on desktop (same for the Summary month picker). Desktop: type the amount, Enter saves.
- As fast as Cashew's quick-add, or faster.

### 7.6 Transactions
- Comfortable rows: colored category icon chip, merchant, category below it, amount on the right. Grouped by day, with a daily total in each group header. Greyed upcoming bills at the top (§6).
- **Built Nov 8, 2026 (owner picked layout A "Grouped" from 3 mockups):** month header with arrows (back to Dec 2024; switches in place like Summary), search, filter chips (All / Cards / Chequing / Money in) + Transfers toggle (off by default), merchant names cleaned from bank descriptors (`src/lib/merchant.ts`). Tapping a row opens an edit sheet: Out/In + amount, category (all kinds, grouped), account, date, note, Save, Delete (tap twice). Split transactions show their lines read-only.
- Search, plus filters for account, category, date range, amount, transfers on/off and uncategorized.
- Mobile: swipe actions (change category, split), tap for detail. Desktop: a dense table with inline editing and bulk actions.

### 7.7 Budgets & recurring
- A monthly budget per category, grouped as essential fixed, essential variable, and discretionary. Colors follow §7.3.
- Pace indicator ("on track", "ahead of pace by $X").
- Category drill-down (desktop-rich): daily spending chart, transactions, month-over-month history.
- **Recurring detection:** same merchant, similar amount, regular interval. The owner confirms or dismisses each one. Confirmed series feed the upcoming-bill rows (§6), with a monthly total for subscriptions.

**Budget lines (decided Nov 8, 2026).** Budgets are planned per *line*; a line covers one or more categories and has a default monthly amount, with per-month overrides (`budget_lines`, `budget_line_categories`, `budgets`). Target: **total under $2,800/month**. Fixed lines use the real statement amounts:

| Fixed | /month | Variable cap | /month |
|---|---|---|---|
| Rent | $700.00 | Groceries | $300 |
| Student loan EMI | $510.00 | Eating out & other (+ misc, gifts, career) | $300 |
| Send home (India) | $40.00 | Gas & car (fuel, parking, maintenance) | $100 |
| Car insurance | $279.58 | Shopping & personal care (+ household, health) | $100 |
| Phone & internet | $105.00 from Dec 2026 ($132.23 in Nov) | Fun (entertainment, travel, gym) | $200 |
| Subscriptions (now **fixed**) | $67.18 | | |
| Affirm | $50 ($175.94 in Nov 2026) | | |
| Card interest | ~$153.38 estimate: Triangle 21.99% + CIBC 21.75% (update from the Nov 19–20 statements) | | |

- A fixed line paid exactly as planned is "Paid ✓", not red; it only turns red when it costs more than planned. Variable lines use the §7.3 bands.
- The owner pays the cards down gradually: track interest as a cost, don't give payoff advice.
- **Headline budget is a round $3,000/month** (`profiles.monthly_budget_cents`), used by the Home hero, the Summary budget card and Budgets. The lines underneath are the detailed plan; Budgets shows the gap as a buffer, or as "over the $3,000".
- Home starts with a greeting (time of day + name from `profiles.display_name`) and today's date. Money owed to the owner is shown greyed under Cash and is never added to it.

**Editing in the app (built Nov 8, 2026):** Budgets → Edit sets the monthly total and every line (one plain budget; no per-month options in the UI, owner's choice). Unsaved edits are discarded when the sheet closes. Debts / Cash → tap a balance → Update balance (reconcile snapshot as of today). Cash → Owed to you: add, mark paid back, remove. Transaction edit sheet → "Friend owes me" (half / third / quarter presets): that part is subtracted from the transaction in summaries and budgets and appears on the Owed list.

**Bills, prompts, goals (built Nov 8, 2026, phase A):** `/bills` lists upcoming bills (add / edit / stop / delete) and "Looks like a bill" suggestions (same merchant ≥3× about monthly within 15% of the typical amount, over the last ~4 months; skips merchants and same-category amounts already covered by a bill; Dismiss is remembered in `dismissals`). Home shows savings prompts: the **3rd paycheque** (from that payday to the 5th of next month) and **month-end leftover** (last 3 days of the month to the 5th of the next, only if under the $3,000). "Move to savings" records a linked chequing → savings transfer pair. `/goals`: target, monthly amount, optional linked savings account for progress. On phones, Settings is the hub for Bills, Goals, Cash, Debts and Imports. Dev only: `KP_FAKE_TODAY=YYYY-MM-DD npm run dev` pretends it's another day.

### 7.8 Savings goals
- Name, target amount, monthly contribution (feeds `savings_target`), progress. A goal can be linked to the savings account.

### 7.9 Month-over-month
- This month vs. last month, and monthly totals by category over time. Data starts Jan 2026, so this works right away.

### 7.10 Summaries
- A **Summary** action (button + chat command): by default it summarizes **last month**. On request, it summarizes **a specific week** instead.
- Content: total spent vs. budget, discretionary result, biggest categories and changes vs. the previous period, unusual or large transactions, Cash / Debts / Investments change, and one or two plain-language observations about habits.
- Generated by `claude-sonnet-5-5` from the same database functions the app uses, never from guessed numbers.

**Summary navigation (decided Nov 8, 2026).** Every category row (spending and income) expands to show that month's transactions. Month arrows go back to **Jan 2026**; one step further is a single page titled **2024–2025** (Money Pro, Dec 2024 – Dec 2025: totals, monthly averages, categories, income sources, adjustments), and nothing before it. Tapping the month title opens a **month picker** sheet (a 12-month grid per year with each month's spending, plus a 2024–2025 tile). The Summary budget card is display-only. **Adjustments** (Cashew's Jan 1, 2026 starting point +$2,310; Money Pro's Dec 31, 2025 −$1,700 for untracked Nov–Dec 2025) have their own category kind and card, and never count as income or spending. GIC payouts count as income (loan money coming back). **Month switching never blanks the screen** (decided Nov 8, 2026): the current month stays visible (dimmed, with a thin lime progress line) until the next has loaded, then swaps in place; money figures count up or roll to their new values (`AnimatedCents`). Neighbouring months load in the background; the URL stays in sync via `history.pushState`, so back/forward/refresh work. Skeletons appear only on a cold load. No page-wide crossfade between screens. "vs last month" comparisons are hidden for the current month (shown for finished months).

> **Decided Nov 8, 2026: no in-app chat and no in-app summary button.** The owner talks to their finances from their own Claude app (claude.ai / desktop / mobile) through the **MCP server** below, keeping every conversation there. The chat screen, memory screen and "Write my summary" button are dropped; the MCP tools (read + draft→confirm writes) carry that role. The mobile tab bar is Home · Activity · (+) · Budgets · **Settings** (updated Nov 8, 2026). Settings is the hub on phones for Summary, Bills, Goals, Cash, Debts, Investments and Imports. Every screen reached from elsewhere has a "‹ Back" link (history back, or a sensible fallback when opened directly).

### 7.11 Claude chat _(superseded: see note above; MCP section still applies)_: the owner's own finance assistant
A chat screen where Claude knows the owner's financial context, learns their habits, and **does the data entry**.

**Plain-language entry.** Example: *"I just spent $120 in groceries, $50 eating out but my friend owes me 50% of it. $100 Costco run which has $20 of household items."* Claude turns this into:
- $120 → Groceries
- $50 → Eating out, with $25 owed by friend (**asks who**, if not said)
- $100 Costco → split $80 Groceries + $20 Household
- Account: asks, or uses a learned default (e.g. "you usually use the Costco card at Costco")

It then shows a **confirmation card** with every line, which the owner can edit inline. Nothing is saved until the owner taps Confirm. Later statement imports match these entries instead of duplicating them (§4.3).

**Tools (server functions; Claude never gets raw SQL):**
- Read: `sum_spending`, `list_transactions`, `compare_periods`, `get_budget_status`, `get_discretionary`, `get_balances` (cash / debts / investments), `list_upcoming`, `get_summary(period)`.
- Write, **proposal only** (each returns a draft for the confirmation card): `propose_transactions` (with splits and shared amounts), `propose_transfer`, `propose_investment_update`, `propose_budget_change`, `propose_rule`.

**Financial context & memory:**
- The owner will provide their financial context exported from their Claude app history. Store it as the assistant's starting memory.
- The assistant keeps a **memory** (an `ai_memory` table) of facts and habits ("pays Costco on the Costco card", "friend Alex usually splits dinners", "groceries run ~$450/month"). Claude adds and updates memories as it learns, and includes the relevant ones in each conversation.
- A **Memory** screen where the owner can view, edit and delete every memory. No hidden state.

**MCP server:**
- Expose the same tools as a remote MCP endpoint (`/api/mcp`, authenticated with a revocable personal token stored hashed), so the owner can connect **Claude Desktop / claude.ai** and talk to their finances there too.
- Write tools over MCP work as **draft → confirm inside the Claude conversation** (decided by the owner). Claude shows the draft, and saves it only after the owner says yes in that chat. Every MCP write is logged with its source (`mcp`) and can be undone from the app.

**MCP built Nov 9, 2026 (phase 8).** Endpoint `https://<app>/api/mcp/<token>` (mcp-handler, Streamable HTTP, stateless). Settings → Connect Claude creates a connector link (32 random bytes, stored as SHA-256 in `api_tokens`, shown once, revocable, "last used" tracked); the owner adds it on claude.ai → Settings → Connectors → Add custom connector. Requests run as the owner through a real user session (RLS applies). Tools: get_overview, get_month_summary, list_transactions, get_budget, get_debts, get_bills_and_owed, list_categories_and_accounts (read); draft_transactions → confirm_draft / discard_draft (writes: draft saves nothing; confirm is single-use, 24h, rows marked `source = mcp`). Ambiguous categories/accounts come back as questions, never guesses. The emergency fund amount is never exposed.

### 7.12 Notifications (web push)
- **Budget warnings:** push a notification when a category, or the discretionary pool, reaches **80%** and **100%** (the color bands in §7.3 are always visible in the app).
- **Update reminder:** **every Sunday at 7 pm (Toronto time)**, a nudge to upload new statements or record changes (expenses, income, adjustments, investment values, the student loan INR balance).
- No other notifications.

### 7.13 iPhone widget (Scriptable): build after the app works
- A **donut chart** of this month's discretionary pool: green = left, red = spent, with the amount left in the center. **On the left side**, how much each discretionary category consumed this month.
- Essentials are excluded, as in §7.2.
- Data comes from `GET /api/widget`. It returns aggregates only, and is authenticated with a revocable personal token (stored hashed). It never uses the Supabase keys.
- Deliver the Scriptable script plus setup steps for the small and medium widget sizes. Draw the donut with `DrawContext`.

---

## 8. Data model (starting point; refine as needed)

`accounts` (group: cash_bank | cash_emergency | debt_card | debt_loan | investment; institution; hidden flag; opening balance + date), `balance_snapshots` (manual values for investments, loan balance and reconciliations), `categories`, `merchants`, `rules`, `transactions`, `transaction_splits`, `shared_debts` (person, amount_cents, transaction/split, settled_at, settlement_transaction_id), `imports`, `budgets` (category_id, month, amount_cents), `income_settings` (amount, anchor payday, holiday rule), `paycheques` (expected vs. actual date), `savings_goals`, `recurring_series`, `ai_memory`, `ai_drafts`, `chat_threads`, `chat_messages`, `push_subscriptions`, `notification_settings`, `api_tokens` (widget + MCP).

Put the heavy calculations (balances, monthly totals, discretionary, budget status, paydays, summaries' inputs) in Postgres views or RPC functions, so the app, the Claude tools, the MCP server and the widget all use the same numbers.

---

## 9. Design direction (this is a top priority)

The owner wants **the best possible UI/UX, not a generic AI template**. That means no default shadcn look, no generic gradient hero, and no stock dashboard layout.

**Style:** bold and colorful on overview screens, data-dense on drill-down screens. Mobile stays simple, and desktop carries the depth.

| Element | Decision |
|---|---|
| Palette (dark) | Near-black `#0A0A0A` surfaces with layered greys for depth. Accent: **electric lime `#B6FF3B`**. Budget colors per §7.3. |
| Palette (light) | White and light-grey surfaces with the same lime family. Use a darker lime shade wherever lime is text or a thin line on white, to keep WCAG AA contrast. |
| Theme | Follow the system setting (light/dark). |
| Typography | Geometric sans (e.g. Geist) for text. **Monospaced tabular numbers** (e.g. Geist Mono, `tabular-nums`) for every amount. |
| Charts | **Rounded donuts and soft rounded bars** with gentle gradients. Animate in. |
| Categories | **Colored icon chips**: each category has its own color and a Lucide line icon in a rounded square. |
| Transaction list | Comfortable rows, grouped by day, with daily totals. Upcoming bills greyed. |
| Navigation (mobile) | **Bottom tab bar with a raised center + button**: Home · Transactions · (+) · Budgets · Chat. Cash / Debts / Investments open from the Home tiles. Settings, Goals and Memory are reached from Home's header. Respect iOS safe areas. **ASK** via mockups. |
| Navigation (desktop) | Left sidebar: Home, Cash, Debts, Investments, Transactions, Budgets, Goals, Imports, Chat, Settings. |
| Privacy | Emergency fund hidden by default. Optionally, a "hide all amounts" toggle for using the app in public. |
| Demo mode | For showing the app to people. A **built-in fake dataset** (a fictional person with realistic accounts, budgets and spending) replaces all data. When it's on, **no real data is ever fetched**, so nothing real can flash on screen. Switched by a long-press on the logo or a toggle in Settings. A subtle "Demo" badge shows while it's on. It turns off automatically after 15 minutes or when the app closes. All writes, imports and chat are disabled in demo mode. A public **`/demo`** route, needing no sign-in, shows the same dataset so others can open it on their own phones. |
| Motion | Rich but quick: numbers count up, charts animate in, springy bottom sheets, iOS-style swipe gestures. Everything under 300 ms, and respect `prefers-reduced-motion`. |
| Feel | Native-app quality: a 44 px minimum touch target, no layout shift, skeleton loaders, optimistic updates. |

**Design process (required):** before building each major screen (Home, Cash, Debts, Investments, Transactions, Transaction detail, Quick-add, Budgets, Category drill-down, Import review, Chat + confirmation card, Memory, Summary, Goals, Settings, Widget), **show the owner 2–3 distinct layout options** as quick mockups, for both mobile and desktop where relevant, and let them choose. Ask what they like and where. Don't skip this step.

---

## 10. Build order

Each phase ends with something that works on the owner's phone. Run the tests and show the result before moving on.

0. **Setup:** repo, Next.js, Tailwind, shadcn, both Supabase projects, Vercel, environment variables, design tokens (colors, budget colors, type, spacing, motion) and the app shell (mobile tab bar + desktop sidebar).
1. **Schema + auth:** migrations, RLS, email/password sign-in, accounts and groups (§3), seeded categories (owner reviews them).
2. **Importers + starting data:** read the owner's files, build the Cashew importer and category mapping, the bank and card parsers (and PDF extraction if needed) with tests, duplicate and transfer detection with tests. Load the starting data into `expense-dev` for review, then into `expense-prod`.
3. **Categorization + review:** rules engine, merchant cleanup, Claude fallback, review screen, corrections that become rules.
4. **Core screens:** Home (Cash / Debts / Investments tiles), the three sections, Transactions, Transaction detail, Quick-add, splits, shared debts, reconcile.
5. **Income, budgets + discretionary:** payday schedule (with holiday rule), 3rd-paycheque → savings, budgets with color bands, discretionary math with full tests, month-end leftover prompt.
6. **Recurring + upcoming bills:** detection, confirmation, greyed next-occurrence rows. Month-over-month views. Savings goals.
7. **Claude chat:** read tools, proposal tools + confirmation card, memory with its screen, importing the owner's financial context, Summary.
8. **MCP server** for Claude Desktop / claude.ai.
9. **PWA polish:** install, offline shell, web push (80% / 100% budget warnings, weekly update reminder), demo mode + public `/demo`, custom domain `kharcha-paani.com` on Vercel.
10. **Widget:** `/api/widget` + Scriptable script.

---

## 11. Open questions to ASK the owner when you reach them

- Review of the seeded categories (phase 1).
- Investment accounts, if any (phase 4; currently none).
- 2–3 layout options for every major screen, mobile and desktop (all phases).

Card activity after the statements (CIBC and Triangle after Oct 18, chequing after Oct 31) will be entered by the owner as their first test entries once the app works. Don't ask for it.
