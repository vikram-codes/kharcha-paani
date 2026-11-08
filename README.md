# Ledger: personal expense tracker

Mobile-first PWA for cash, debts, investments and what's left to spend this month.
The full spec is in [BUILD_PROMPT.md](BUILD_PROMPT.md).

## Stack
Next.js 16 (App Router) · Tailwind 4 · shadcn/ui (Base UI) · Supabase · Vercel · Vitest

## Commands
```bash
npm run dev         # http://localhost:3000
npm test            # Vitest (money math, budget bands, parsers)
npm run typecheck   # next typegen + tsc
npm run lint
npm run build
```

## Private data
`statements/` (original PDFs/CSV) and `data/` (cleaned seed) hold real financial data.
Both are git-ignored and must never be committed. `tools/seed/` holds the Python parsers
that produced `data/seed/`.
