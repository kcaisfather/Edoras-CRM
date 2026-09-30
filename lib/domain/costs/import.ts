/**
 * Maliyet CSV / Excel içe aktarma: tarayıcıda okunan tablo → satır adayları (saf; testler import.test.ts). Sunucu her satırı
 * yeniden doğrular (costEntryInputSchema) ve aynı satırı (hizmet + ay + tutar + para birimi + not) ikinci kez eklemez.
 *
 * Başlıklar (büyük/küçük harf ve Türkçe karakterden bağımsız): Hizmet · Ay · Tutar · Para birimi (ops., varsayılan TL) ·
 * Kur (USD için) · Not (ops.). Ay: 2026-09, 2026-09-01, 09/2026, 09.2026 ya da "Eylül 2026".
 */
import { parseDecimal } from "./schemas";
import { COST_SERVICES, type CostCurrency, type CostService } from "./types";
import type { CostEntryInput } from "./schemas";

export const COST_IMPORT_HEADERS = ["Hizmet", "Ay", "Tutar", "Para birimi", "Kur", "Not"] as const;

export const COST_IMPORT_TEMPLATE_ROWS: string[][] = [
  ["Supabase", "2026-09", "25", "USD", "41,50", "Pro plan"],
  ["Vercel", "2026-09", "20", "USD", "41,50", "Pro"],
  ["SMS", "2026-09", "1250,50", "TL", "", "MutluCell faturası"],
  ["OpenAI", "2026-09", "12,40", "USD", "41,50", ""],
];

const fold = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<"service" | "month" | "amount" | "currency" | "fxRate" | "note", string[]> = {
  service: ["hizmet", "servis", "service"],
  month: ["ay", "donem", "tarih", "month", "period"],
  amount: ["tutar", "miktar", "amount", "bedel"],
  currency: ["parabirimi", "para", "birim", "currency", "doviz"],
  fxRate: ["kur", "dovizkuru", "fx", "fxrate"],
  note: ["not", "aciklama", "note"],
};

export type CostImportColumn = keyof typeof HEADER_ALIASES;

/** Başlık satırından sütun eşlemesi (bulunamayan alan yok). */
export function detectCostColumns(headers: readonly string[]): Partial<Record<CostImportColumn, number>> {
  const out: Partial<Record<CostImportColumn, number>> = {};
  headers.forEach((h, i) => {
    const key = fold(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [CostImportColumn, string[]][]) {
      if (out[field] === undefined && aliases.includes(key)) out[field] = i;
    }
  });
  return out;
}

const SERVICE_ALIASES: Record<string, CostService> = {
  supabase: "SUPABASE",
  veritabani: "SUPABASE",
  vercel: "VERCEL",
  hosting: "VERCEL",
  sms: "SMS",
  mutlucell: "SMS",
  openai: "OPENAI",
  ai: "OPENAI",
  resend: "RESEND",
  eposta: "RESEND",
  mail: "RESEND",
  domain: "DOMAIN",
  alanadi: "DOMAIN",
  diger: "OTHER",
  other: "OTHER",
};

export function parseCostService(input: string): CostService | null {
  const key = fold(input);
  const code = COST_SERVICES.find((s) => fold(s) === key);
  return code ?? SERVICE_ALIASES[key] ?? null;
}

const MONTH_NAMES = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];

/** Ay biçimleri → "YYYY-MM"; tanınmazsa null. */
export function parseCostMonth(input: string): string | null {
  const s = input.trim();
  let m = /^(\d{4})[-./](\d{1,2})(?:[-./]\d{1,2})?(?:[ T].*)?$/.exec(s);
  if (m) return normalizeMonth(m[1], m[2]);
  m = /^(\d{1,2})[-./](\d{4})$/.exec(s);
  if (m) return normalizeMonth(m[2], m[1]);
  m = /^([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})$/.exec(s);
  if (m) {
    const idx = MONTH_NAMES.indexOf(fold(m[1]));
    if (idx >= 0) return normalizeMonth(m[2], String(idx + 1));
  }
  return null;
}

function normalizeMonth(year: string, month: string): string | null {
  const mm = Number(month);
  const yy = Number(year);
  if (!(mm >= 1 && mm <= 12) || yy < 2020 || yy > 2100) return null;
  return `${year}-${String(mm).padStart(2, "0")}`;
}

export function parseCostCurrency(input: string): CostCurrency | null {
  const key = fold(input.replace(/[$₺]/g, (c) => (c === "$" ? "usd" : "try")));
  if (key === "" || key === "try" || key === "tl" || key === "trl") return "TRY";
  if (key === "usd" || key === "dolar") return "USD";
  return null;
}

export type CostImportIssue = "service" | "month" | "amount" | "currency" | "fxRate";

export interface CostImportRow {
  /** Dosyadaki 1 tabanlı satır numarası. */
  rowNumber: number;
  value: CostEntryInput | null;
  issues: CostImportIssue[];
}

/** Tabloyu satır adaylarına çevirir; hatalı alanlar `issues`'ta (o satır gönderilmez, önizlemede kırmızı). */
export function rowsFromCostTable(
  columns: Partial<Record<CostImportColumn, number>>,
  rows: readonly (readonly string[])[],
  rowNumbers: readonly number[]
): CostImportRow[] {
  const cell = (row: readonly string[], field: CostImportColumn) => (columns[field] === undefined ? "" : (row[columns[field]] ?? "").trim());
  return rows.map((row, i) => {
    const issues: CostImportIssue[] = [];
    const service = parseCostService(cell(row, "service"));
    if (!service) issues.push("service");
    const month = parseCostMonth(cell(row, "month"));
    if (!month) issues.push("month");
    const amount = parseDecimal(cell(row, "amount"), 2);
    if (amount === null || amount <= 0) issues.push("amount");
    const currency = parseCostCurrency(cell(row, "currency"));
    if (!currency) issues.push("currency");
    const fxRaw = cell(row, "fxRate");
    const fxRate = fxRaw === "" ? null : parseDecimal(fxRaw, 4);
    if (currency === "USD" && (fxRate === null || fxRate <= 0)) issues.push("fxRate");
    if (currency === "TRY" && fxRaw !== "" && (fxRate === null || fxRate <= 0)) issues.push("fxRate");
    const note = cell(row, "note");
    const value: CostEntryInput | null =
      issues.length === 0 && service && month && amount !== null && currency
        ? { service, month, amount, currency, fxRate: currency === "USD" ? fxRate : null, note: note ? note.slice(0, 500) : null }
        : null;
    return { rowNumber: rowNumbers[i] ?? i + 2, value, issues };
  });
}

/** Aynı satırı tanıyan anahtar (tekrar yüklemede atlamak için). */
export function costEntryKey(e: Pick<CostEntryInput, "service" | "month" | "amount" | "currency" | "note">): string {
  return [e.service, e.month, e.amount.toFixed(2), e.currency, (e.note ?? "").trim().toLocaleLowerCase("tr")].join("|");
}
