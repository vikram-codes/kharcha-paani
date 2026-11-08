import { getDocumentProxy } from "unpdf";

type Item = { str: string; x: number; y: number; w: number };

/**
 * PDF → text that keeps the column layout, like `pdftotext -layout`: each text
 * item is placed at a character column proportional to its x position, and
 * items on the same baseline share a line. The statement parsers rely on
 * columns being separated by 2+ spaces and on left indentation.
 */
export async function pdfToLayoutText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    }
    pages.push(layoutPage(items));
  }
  return pages.join("\n\f\n");
}

export function layoutPage(items: Item[]): string {
  if (!items.length) return "";
  // Typical character width on this page (median of per-item averages).
  const widths = items.filter((i) => i.str.length >= 3 && i.w > 0).map((i) => i.w / i.str.length).sort((a, b) => a - b);
  const charW = widths.length ? widths[Math.floor(widths.length / 2)] : 5;

  // Group by baseline (top of page first); items within 2pt share a line.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - it.y) <= 2) line.push(it);
    else lines.push([it]);
  }

  return lines
    .map((line) => {
      let out = "";
      let lastEnd: number | null = null;
      for (const it of line.sort((a, b) => a.x - b.x)) {
        if (lastEnd !== null) {
          // Real gap between this item and the previous one decides the separator:
          // a column gap always gets 2+ spaces, a word gap 1, touching text none.
          const gap = it.x - lastEnd;
          const min = gap > charW * 1.2 ? 2 : gap > charW * 0.15 ? 1 : 0;
          const trailing = out.length - out.trimEnd().length;
          if (trailing < min) out += " ".repeat(min - trailing);
        }
        const col = Math.round(it.x / charW);
        if (col > out.length) out += " ".repeat(col - out.length);
        out += it.str;
        lastEnd = it.x + it.w;
      }
      return out.replace(/\s+$/, "");
    })
    .join("\n");
}
