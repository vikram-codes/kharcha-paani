// Run: node scripts/verify-statements.mts  (reads the git-ignored statements/ folder; never commit statements)
// Parse every PDF in statements/ with the in-app parser and compare against the seed rows
// (which were produced by the pdftotext-based Python parser and verified by hand).
import { readFileSync, readdirSync } from "node:fs";
import { pdfToLayoutText } from "../src/lib/import/pdf-text.ts";
import { parseStatement } from "../src/lib/import/statements.ts";
const seed = JSON.parse(readFileSync("data/seed/statement_rows.json", "utf8")) as { account: string; date: string; amount: number; source: string }[];
let allOk = true;
for (const f of readdirSync("statements").filter((x) => x.endsWith(".pdf")).sort()) {
  const text = await pdfToLayoutText(new Uint8Array(readFileSync(`statements/${f}`)));
  try {
    const s = parseStatement(text);
    const want = seed.filter((r) => r.source === f.replace(/\.pdf$/, ".txt")).map((r) => `${r.date} ${Math.round(r.amount * 100)}`).sort();
    const got = s.rows.map((r) => `${r.date} ${r.amount_cents}`).sort();
    const same = JSON.stringify(want) === JSON.stringify(got);
    const checksOk = s.checks.every((c) => c.ok);
    allOk &&= same && checksOk;
    console.log(`${checksOk && same ? "OK  " : "FAIL"} ${f.padEnd(34)} ${s.source.padEnd(16)} ${String(s.rows.length).padStart(3)} rows  end ${s.periodEnd}${s.payment ? `  due ${s.payment.dueDate} bal ${s.payment.balanceCents} min ${s.payment.minimumCents}` : ""}  checks:${s.checks.map((c) => (c.ok ? "✓" : `✗(${c.got}≠${c.want})`)).join("")}  ${same ? "matches seed" : `seed ${want.length} vs ${got.length}`}`);
    if (!same) {
      const g = new Set(got), w = new Set(want);
      console.log("   missing:", want.filter((x) => !g.has(x)).slice(0, 5), " extra:", got.filter((x) => !w.has(x)).slice(0, 5));
    }
  } catch (e) {
    allOk = false;
    console.log(`FAIL ${f}: ${(e as Error).message}`);
  }
}
console.log(allOk ? "\nALL STATEMENTS OK" : "\nSOME FAILED");
