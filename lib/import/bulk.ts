/**
 * Toplu içe aktarma sözleşmesi ve SUNUCU doğrulaması (tek kaynak: istemci gövdeyi bununla kurar, sunucu bununla
 * doğrular). DeepSport sözleşmesi (docs/backend-requests.md → Madde 13 + EK-1): `POST …/prospects/bulk { items }` ve
 * `POST /crm-leads/bulk { items, dryRun }` — sunucu telefon (E.164) ve e-posta ile mükerrer kontrolünü KENDİ yapar.
 *
 * - İstemci yalnız ham değerleri gönderir; normalize telefon / e-posta ve mükerrer işaretleri gövdede YOKTUR
 *   (gelse de şema atar). Sunucu ham metinden yeniden hesaplar (lib/import/normalize.ts).
 * - Mükerrer hiçbir koşulda eklenmez: aynı istekteki önceki satır, hedef listedeki kişi (soğuk liste), CRM adayı ve
 *   kurum yetkilisi (crm_institutions) telefon ya da e-postasıyla karşılaştırılır. Atlanan satır `skipped`'te
 *   nedeniyle döner; kişisel veri dönmez.
 * - Satır başına alan sınırları veritabanıyla aynı (crm_prospects_length_check, crm_leads_length_check); aşan satır
 *   atlanır (TOO_LONG), istek reddedilmez.
 */
import { z } from "zod";
import { cleanText, normalizeImportEmail, normalizeImportPhone } from "./normalize";
import type { ImportRecord } from "./records";

/** İstek başına en çok satır (SQL: crm_add_prospects da denetler). */
export const BULK_MAX_ITEMS = 2000;
/** İstek gövdesinin üst sınırı (bayt). */
export const BULK_MAX_BYTES = 2 * 1024 * 1024;
/** İstemcinin tek istekte gönderdiği satır (ilerleme ve durdurma bu parçalarla). */
export const BULK_CHUNK_SIZE = 500;

/** Alan sınırları (veritabanıyla aynı; soğuk liste kişisi aday sınırlarının altında kalır). */
export const IMPORT_FIELD_LIMITS = {
  firstName: 100,
  lastName: 100,
  organization: 200,
  phoneRaw: 50,
  emailRaw: 254,
  city: 100,
  district: 100,
  branch: 100,
  note: 1000,
} as const;
type TextField = keyof typeof IMPORT_FIELD_LIMITS;
const TEXT_FIELDS = Object.keys(IMPORT_FIELD_LIMITS) as TextField[];

/** Gövdede tek alanın kabul edilen üst sınırı; ölçülü sınır satır bazında (TOO_LONG). */
const RAW_MAX = 5000;
const raw = z.string().max(RAW_MAX).default("");

export const importItemSchema = z.object({
  /** Dosyadaki satır numarası — yalnız `skipped` yanıtında geri döner (gösterim). Yoksa gövdedeki sıra + 1. */
  row: z.number().int().min(1).max(1_000_000).optional(),
  firstName: raw,
  lastName: raw,
  organization: raw,
  phoneRaw: raw,
  emailRaw: raw,
  city: raw,
  district: raw,
  branch: raw,
  note: raw,
});
export type ImportItem = z.input<typeof importItemSchema>;
export type ImportItemValues = z.output<typeof importItemSchema>;

const items = z.array(importItemSchema).min(1).max(BULK_MAX_ITEMS);

/** POST /api/crm/prospect-lists/{id}/prospects/bulk */
export const bulkProspectsSchema = z.object({ items });
/** POST /api/crm/leads/bulk — `dryRun`: aynı rapor, yazmadan. */
export const bulkLeadsSchema = z.object({ items, dryRun: z.boolean().default(false) });
export type BulkLeadsInput = z.input<typeof bulkLeadsSchema>;

export const IMPORT_SKIP_REASONS = [
  "EMPTY",
  "TOO_LONG",
  "IDENTITY_REQUIRED",
  "INVALID_PHONE",
  "INVALID_EMAIL",
  "DUPLICATE_IN_FILE",
  "DUPLICATE_IN_LIST",
  "DUPLICATE_CRM",
  "DUPLICATE_INSTITUTION",
] as const;
export type ImportSkipReason = (typeof IMPORT_SKIP_REASONS)[number];

export interface SkippedRow {
  row: number;
  reason: ImportSkipReason;
}

/** Toplu uçların yanıtı. `dryRun` true ise hiçbir şey yazılmamıştır; `created` eklenecek satır sayısıdır. */
export interface BulkImportResult {
  created: number;
  skipped: SkippedRow[];
  dryRun: boolean;
}

/** Sunucunun yazacağı biçim: boş → null, telefon E.164, e-posta küçük harf (çevrilemezse null, ham değer kalır). */
export interface NormalizedItem {
  row: number;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  phoneRaw: string | null;
  phone: string | null;
  emailRaw: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  branch: string | null;
  note: string | null;
}

const orNull = (s: string) => (s ? s : null);

export function normalizeItem(item: ImportItemValues, index: number): NormalizedItem {
  const text = (v: string) => orNull(cleanText(v));
  const phoneRaw = orNull(item.phoneRaw.trim());
  const emailRaw = orNull(item.emailRaw.trim());
  return {
    row: item.row ?? index + 1,
    firstName: text(item.firstName),
    lastName: text(item.lastName),
    organization: text(item.organization),
    phoneRaw,
    phone: normalizeImportPhone(phoneRaw),
    emailRaw,
    email: normalizeImportEmail(emailRaw),
    city: text(item.city),
    district: text(item.district),
    branch: text(item.branch),
    note: orNull(item.note.trim()),
  };
}

export interface ContactSets {
  phones: ReadonlySet<string>;
  emails: ReadonlySet<string>;
}

export const EMPTY_CONTACTS: ContactSets = { phones: new Set(), emails: new Set() };

/** Telefon / e-posta listesinden karşılaştırma kümeleri (e-posta küçük harfe, telefon E.164'e çevrilir). */
export function contactSets(rows: readonly { phone?: string | null; email?: string | null }[]): ContactSets {
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const r of rows) {
    const p = normalizeImportPhone(r.phone);
    if (p) phones.add(p);
    const e = normalizeImportEmail(r.email);
    if (e) emails.add(e);
  }
  return { phones, emails };
}

export type ImportTarget = "coldList" | "crm";

export interface ScreenContext {
  target: ImportTarget;
  /** CRM adaylarının telefon / e-postası. */
  crm: ContactSets;
  /** Kurum yetkilileri (crm_institutions). */
  institutions: ContactSets;
  /** Hedef soğuk listedeki kişiler (yalnız coldList). */
  list?: ContactSets;
}

const hits = (set: ContactSets, n: NormalizedItem) => (!!n.phone && set.phones.has(n.phone)) || (!!n.email && set.emails.has(n.email));

/** Satırın kendi kusuru (mükerrer dışında). */
function rowProblem(n: NormalizedItem, target: ImportTarget): ImportSkipReason | null {
  if (!n.firstName && !n.lastName && !n.organization && !n.phoneRaw && !n.emailRaw) return "EMPTY";
  if (TEXT_FIELDS.some((f) => (n[f]?.length ?? 0) > IMPORT_FIELD_LIMITS[f])) return "TOO_LONG";
  if (target === "crm") {
    // Aday kuralları (crm_leads_identity_check, telefon E.164, e-posta biçimi): geçersiz değer yazılamaz.
    if (!n.organization && !n.firstName && !n.lastName) return "IDENTITY_REQUIRED";
    if (n.phoneRaw && !n.phone) return "INVALID_PHONE";
    if (n.emailRaw && !n.email) return "INVALID_EMAIL";
  }
  return null;
}

/**
 * Sunucu ayıklaması: her satır normalleştirilir, kusurlu ve mükerrer satırlar nedeniyle atlanır. Öncelik: satır
 * kusuru → hedef liste → CRM adayı → kurum yetkilisi → aynı istekte daha önce kabul edilen satır. Soğuk listede
 * geçersiz telefon / e-posta satırı atlatmaz (ham değer saklanır, normalize değer boş kalır).
 */
export function screenImportItems(
  input: readonly ImportItemValues[],
  ctx: ScreenContext
): { accepted: NormalizedItem[]; skipped: SkippedRow[] } {
  const accepted: NormalizedItem[] = [];
  const skipped: SkippedRow[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  input.forEach((item, index) => {
    const n = normalizeItem(item, index);
    const reason: ImportSkipReason | null =
      rowProblem(n, ctx.target) ??
      (ctx.target === "coldList" && ctx.list && hits(ctx.list, n) ? "DUPLICATE_IN_LIST" : null) ??
      (hits(ctx.crm, n) ? "DUPLICATE_CRM" : null) ??
      (hits(ctx.institutions, n) ? "DUPLICATE_INSTITUTION" : null) ??
      (hits({ phones: seenPhones, emails: seenEmails }, n) ? "DUPLICATE_IN_FILE" : null);
    if (reason) {
      skipped.push({ row: n.row, reason });
      return;
    }
    if (n.phone) seenPhones.add(n.phone);
    if (n.email) seenEmails.add(n.email);
    accepted.push(n);
  });
  return { accepted, skipped };
}

/** crm_prospects kolonları (crm_add_prospects gövdesi). */
export function toProspectColumns(n: NormalizedItem) {
  return {
    first_name: n.firstName,
    last_name: n.lastName,
    organization: n.organization,
    phone_raw: n.phoneRaw,
    phone: n.phone,
    email_raw: n.emailRaw,
    email: n.email,
    city: n.city,
    district: n.district,
    branch: n.branch,
    note: n.note,
  };
}

/**
 * crm_leads kolonları: statü Aranacak, kaynak IMPORT. Tutar alanları BİLİNÇLİ OLARAK yazılmaz; program / tür ve
 * not adayda kolon olmadığı için aktarılmaz (DeepSport ile aynı — korumak için önce soğuk listeye aktarılır).
 */
export function toLeadColumns(n: NormalizedItem, actor: string) {
  return {
    organization_name: n.organization,
    contact_first_name: n.firstName,
    contact_last_name: n.lastName,
    contact_phone: n.phone,
    contact_email: n.email,
    city: n.city,
    district: n.district,
    status: "ARANACAK" as const,
    source: "IMPORT" as const,
    created_by: actor,
    updated_by: actor,
  };
}

/** Önizleme kaydı → gövde öğesi: yalnız ham değerler (normalize değer ve mükerrer işareti gönderilmez). */
export function recordToImportItem(r: ImportRecord): ImportItem {
  return {
    row: r.rowNumber,
    firstName: r.firstName,
    lastName: r.lastName,
    organization: r.organization,
    phoneRaw: r.phoneRaw,
    emailRaw: r.emailRaw,
    city: r.city,
    district: r.district,
    branch: r.branch,
    note: r.note,
  };
}
