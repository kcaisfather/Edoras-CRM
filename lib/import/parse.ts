/**
 * İçe aktarma dosyası okuma (DeepSport lib/import/parse.ts): .csv / .txt / .tsv tarayıcıda ayrıştırılır, .xlsx
 * `read-excel-file` ile (dinamik import — yalnız Excel seçilince yüklenir). Eski ikili .xls (BIFF) desteklenmez;
 * kullanıcıya "Farklı kaydet → .xlsx / CSV" denir. Dosyanın kendisi sunucuya gitmez: yalnız eşlenen alanlar
 * kayıt olarak gönderilir ve sunucu hepsini yeniden doğrular (lib/import/bulk.ts).
 */

export interface RawTable {
  /** Başlık satırı (boş başlıklar "Sütun N" olur). */
  headers: string[];
  /** Başlıktan sonraki satırlar; her satır başlık uzunluğuna tamamlanır. */
  rows: string[][];
  /** Her satırın dosyadaki 1 tabanlı numarası (boş satırlar atlandığı için ayrı tutulur). */
  rowNumbers: number[];
}

/** Tek dosyada en fazla bu kadar veri satırı işlenir (sunucuya parçalar hâlinde gider). */
export const MAX_IMPORT_ROWS = 5000;

export type ImportFileErrorCode = "xls" | "unsupported" | "empty" | "read" | "tooMany";

export class ImportFileError extends Error {
  constructor(public code: ImportFileErrorCode) {
    super(code);
    this.name = "ImportFileError";
  }
}

/** İlk satıra bakarak ayraç seçer: ";" (Excel TR), "\t" ya da ",". */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const semi = count(";");
  const tab = count("\t");
  const comma = count(",");
  if (tab > semi && tab > comma) return "\t";
  if (semi >= comma && semi > 0) return ";";
  return comma > 0 ? "," : ";";
}

/** RFC 4180 benzeri ayrıştırıcı: tırnaklı alan, kaçışlı tırnak ("") ve alan içi satır sonu. */
export function parseDelimited(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Hücre değerini metne çevirir (Excel tarihleri YYYY-MM-DD). */
export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

/** Ham matristen tablo: ilk dolu satır başlık; tamamen boş satırlar atılır. */
export function tableFromMatrix(matrix: readonly (readonly unknown[])[]): RawTable {
  const cells = matrix.map((r) => r.map(cellToString));
  const headerIndex = cells.findIndex((r) => r.some((c) => c !== ""));
  if (headerIndex < 0) throw new ImportFileError("empty");

  const rawHeaders = cells[headerIndex];
  // Genişlik: başlık dahil herhangi bir satırda dolu olan son sütun (sağdaki boş sütunlar kırpılır).
  let width = 1;
  for (const r of cells.slice(headerIndex)) {
    for (let j = r.length - 1; j >= width; j--) {
      if (r[j] !== "") {
        width = j + 1;
        break;
      }
    }
  }
  width = Math.min(width, 100);

  const headers = Array.from({ length: width }, (_, i) => rawHeaders[i] || `Sütun ${i + 1}`);
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  for (let i = headerIndex + 1; i < cells.length; i++) {
    const r = cells[i];
    if (!r.some((c) => c !== "")) continue;
    rows.push(Array.from({ length: width }, (_, j) => r[j] ?? ""));
    rowNumbers.push(i + 1);
  }
  if (rows.length === 0) throw new ImportFileError("empty");
  if (rows.length > MAX_IMPORT_ROWS) throw new ImportFileError("tooMany");
  return { headers, rows, rowNumbers };
}

/** UTF-8 dener; geçersiz bayt varsa Windows-1254 (Excel TR "CSV" çıktısı) ile çözer. */
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("windows-1254").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
}

export function fileKind(name: string): "csv" | "xlsx" | "xls" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt" || ext === "tsv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  return null;
}

export const IMPORT_ACCEPT = ".xlsx,.xls,.csv,.txt,.tsv";

/** Dosyayı okuyup tabloya çevirir. Excel'de yalnız ilk sayfa okunur. */
export async function readImportFile(file: File): Promise<RawTable> {
  const kind = fileKind(file.name);
  if (kind === "xls") throw new ImportFileError("xls");
  if (!kind) throw new ImportFileError("unsupported");

  if (kind === "csv") {
    let text: string;
    try {
      text = decodeText(await file.arrayBuffer());
    } catch {
      throw new ImportFileError("read");
    }
    return tableFromMatrix(parseDelimited(text));
  }

  let matrix: unknown[][];
  try {
    const { readSheet } = await import("read-excel-file/browser");
    // Sayıları metin olarak al: telefonun başındaki 0 ve uzun numaralar bozulmasın.
    matrix = (await readSheet<string>(file, { parseNumber: (s: string) => s })) as unknown[][];
  } catch {
    throw new ImportFileError("read");
  }
  return tableFromMatrix(matrix);
}
