/**
 * Toplantı notu Markdown'ı → blok listesi (saf; React bileşeni features/management/components/MeetingMarkdown.tsx).
 * KCA Panel'in toplantı notu biçimini (başlık, madde, onay kutusu, tablo, kalın, bağlantı — KCA Panel CLAUDE.md
 * "Toplantı notunun biçimi") okur. HTML üretmez: metin React'te düz metin olarak basılır, bağlantı yalnız http(s).
 */

export type MdInline = { type: "text"; text: string } | { type: "bold"; text: string } | { type: "link"; text: string; href: string };

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: MdInline[] }
  | { type: "paragraph"; lines: MdInline[][] }
  | { type: "list"; ordered: boolean; items: { checked: boolean | null; text: MdInline[] }[] }
  | { type: "table"; header: MdInline[][]; rows: MdInline[][][] };

const LINK_OR_BOLD = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** Satır içi: **kalın**, [ad](https://…) ve çıplak http(s) adresleri. Diğer her şey düz metin. */
export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_OR_BOLD)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ type: "link", text: m[1], href: m[2] });
    else if (m[3] !== undefined) out.push({ type: "bold", text: m[3] });
    else out.push({ type: "link", text: m[4], href: m[4] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*•●▪◦]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const CHECK = /^\[( |x|X)\]\s*(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const isTableLine = (line: string) => /^\s*\|.*\|/.test(line);

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseMarkdown(md: string): MdBlock[] {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let paragraph: MdInline[][] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: Math.min(heading[1].length, 3) as 1 | 2 | 3, text: parseInline(heading[2].trim()) });
      continue;
    }

    if (isTableLine(line)) {
      flush();
      const header = cells(line);
      const rows: string[][] = [];
      let j = i + 1;
      if (j < lines.length && TABLE_SEPARATOR.test(lines[j])) j++;
      while (j < lines.length && isTableLine(lines[j])) {
        if (!TABLE_SEPARATOR.test(lines[j])) rows.push(cells(lines[j]));
        j++;
      }
      // Satırlar başlıktan kısa/uzun olabilir: başlık sütun sayısına tamamlanır / kırpılır.
      const width = header.length;
      blocks.push({
        type: "table",
        header: header.map(parseInline),
        rows: rows.map((r) => Array.from({ length: width }, (_, k) => parseInline(r[k] ?? ""))),
      });
      i = j - 1;
      continue;
    }

    const bullet = line.match(BULLET);
    const ordered = bullet ? null : line.match(ORDERED);
    if (bullet || ordered) {
      flush();
      const isOrdered = !!ordered;
      const items: { checked: boolean | null; text: MdInline[] }[] = [];
      let j = i;
      while (j < lines.length) {
        const m = isOrdered ? lines[j].match(ORDERED) : lines[j].match(BULLET);
        if (!m) break;
        const check = m[1].match(CHECK);
        items.push(check ? { checked: check[1] !== " ", text: parseInline(check[2]) } : { checked: null, text: parseInline(m[1]) });
        j++;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      i = j - 1;
      continue;
    }

    paragraph.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}
