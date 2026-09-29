/**
 * Eşlenmiş tablo satırlarını içe aktarma kayıtlarına çevirir (DeepSport lib/import/records.ts). Telefon E.164'e,
 * e-posta küçük harfe normalize edilir (lib/import/normalize.ts — sunucuyla aynı kural); mükerrer önizlemesi bu
 * normalize değerlerle yapılır.
 */
import type { ColumnMapping, ImportField } from "./fields";
import { normalizeImportEmail, normalizeImportPhone } from "./normalize";
import type { RawTable } from "./parse";

export interface ImportRecord {
  /** Dosya içinde tekil kimlik ("r12"). */
  id: string;
  /** Dosyadaki 1 tabanlı satır numarası (kullanıcıya gösterilir). */
  rowNumber: number;
  firstName: string;
  lastName: string;
  organization: string;
  /** Dosyadaki ham telefon metni. */
  phoneRaw: string;
  /** E.164 (+90…); çevrilemediyse null. */
  phone: string | null;
  emailRaw: string;
  email: string | null;
  city: string;
  district: string;
  /** Program / tür (DeepSport branş). */
  branch: string;
  note: string;
}

export interface BuildRecordsResult {
  records: ImportRecord[];
  /** Eşlenen sütunlarda hiçbir değeri olmayan (atlanan) satır sayısı. */
  emptyRows: number;
}

function cell(row: readonly string[], mapping: ColumnMapping, field: ImportField): string {
  const idx = mapping[field];
  return idx == null ? "" : (row[idx] ?? "").trim();
}

/** "Ahmet Can Yılmaz" → ["Ahmet Can", "Yılmaz"]. */
export function splitFullName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [parts[0] ?? "", ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

export function buildRecords(table: RawTable, mapping: ColumnMapping): BuildRecordsResult {
  const records: ImportRecord[] = [];
  let emptyRows = 0;
  table.rows.forEach((row, i) => {
    let firstName = cell(row, mapping, "firstName");
    let lastName = cell(row, mapping, "lastName");
    const full = cell(row, mapping, "fullName");
    if (full && !firstName && !lastName) [firstName, lastName] = splitFullName(full);
    else if (full && !firstName) firstName = full;

    const phoneRaw = cell(row, mapping, "phone");
    const emailRaw = cell(row, mapping, "email");
    const organization = cell(row, mapping, "organization");
    if (!firstName && !lastName && !organization && !phoneRaw && !emailRaw) {
      emptyRows++;
      return;
    }
    const rowNumber = table.rowNumbers[i] ?? i + 2;
    records.push({
      id: `r${rowNumber}`,
      rowNumber,
      firstName,
      lastName,
      organization,
      phoneRaw,
      phone: normalizeImportPhone(phoneRaw),
      emailRaw,
      email: normalizeImportEmail(emailRaw),
      city: cell(row, mapping, "city"),
      district: cell(row, mapping, "district"),
      branch: cell(row, mapping, "branch"),
      note: cell(row, mapping, "note"),
    });
  });
  return { records, emptyRows };
}

/** Listede gösterilecek ad: tam ad; yoksa kurum, yoksa telefon/e-posta. */
export function recordDisplayName(
  r: Pick<ImportRecord, "firstName" | "lastName" | "organization" | "phoneRaw" | "emailRaw">
): string {
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ");
  return name || r.organization || r.phoneRaw || r.emailRaw || "-";
}

/** Telefon yazılmış ama geçerli numaraya çevrilemiyor mu? */
export function hasInvalidPhone(r: Pick<ImportRecord, "phoneRaw" | "phone">): boolean {
  return !!r.phoneRaw && !r.phone;
}

/** E-posta yazılmış ama geçersiz mi? */
export function hasInvalidEmail(r: Pick<ImportRecord, "emailRaw" | "email">): boolean {
  return !!r.emailRaw && !r.email;
}
