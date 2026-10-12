/**
 * Soğuk liste uçlarının gövde doğrulaması (tek kaynak: istemci ve sunucu). Aktör alanları (created_by) ve sunucunun
 * hesapladığı değerler (normalize telefon / e-posta, outcome_at, moved_at, crm_lead_id) şemada YOKTUR: gövdede
 * gelirse atılır. Kurallar veritabanında da zorunlu (supabase/migrations/20260929180000_crm_prospects.sql).
 * Toplu ekleme gövdesi lib/import/bulk.ts'te.
 */
import { z } from "zod";
import { IMPORT_FIELD_LIMITS } from "@/lib/import/bulk";
import { normalizeImportEmail, normalizeImportPhone } from "@/lib/import/normalize";
import { LOST_REASONS } from "@/lib/domain/crm/types";
import { MOVE_STATUSES, PROSPECT_OUTCOMES } from "./types";

const MSG = {
  name: "Liste adı 1–120 karakter olmalı",
  tooLong: "Çok uzun",
  empty: "Değişiklik yok",
  identity: "Ad, soyad, kurum, telefon ya da e-postadan en az biri gerekli",
  phone: "Geçerli bir telefon numarası girin",
  email: "Geçerli bir e-posta adresi girin",
  list: "Bir soğuk liste seçin",
  lostReason: "Kayıp nedeni seçin",
} as const;

/** Liste adı sınırı (SQL: crm_prospect_lists_name_check). */
export const LIST_NAME_MAX = 120;

/** POST /api/crm/prospect-lists */
export const prospectListCreateSchema = z.object({
  name: z.string().trim().min(1, MSG.name).max(LIST_NAME_MAX, MSG.name),
  sourceFile: z
    .string()
    .trim()
    .max(255, MSG.tooLong)
    .nullable()
    .optional()
    .transform((v) => v || null),
});
export type ProspectListCreateInput = z.input<typeof prospectListCreateSchema>;

const text = (max: number) => z.string().max(max, MSG.tooLong);

/**
 * PATCH /api/crm/prospects/{id} — KISMİ. `outcome` gelirse sonucun anı sunucuda yazılır (Aranmadı'da temizlenir;
 * aynı sonuç yeniden girilse de an yenilenir: "Ulaşılamadı" tekrar denemesi N gün sonra yeniden görev olur).
 * Telefon / e-posta yalnız ham değer olarak gelir; normalize değeri sunucu hesaplar.
 */
export const prospectPatchSchema = z
  .object({
    outcome: z.enum(PROSPECT_OUTCOMES),
    firstName: text(IMPORT_FIELD_LIMITS.firstName),
    lastName: text(IMPORT_FIELD_LIMITS.lastName),
    organization: text(IMPORT_FIELD_LIMITS.organization),
    phoneRaw: text(IMPORT_FIELD_LIMITS.phoneRaw),
    emailRaw: text(IMPORT_FIELD_LIMITS.emailRaw),
    city: text(IMPORT_FIELD_LIMITS.city),
    district: text(IMPORT_FIELD_LIMITS.district),
    branch: text(IMPORT_FIELD_LIMITS.branch),
    note: text(IMPORT_FIELD_LIMITS.note),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: MSG.empty });
export type ProspectPatchInput = z.input<typeof prospectPatchSchema>;
export type ProspectPatchValues = z.output<typeof prospectPatchSchema>;

/** Patch'teki iletişim alanları (işlem kaydına yalnız ADLARI yazılır). */
export const PROSPECT_TEXT_FIELDS = [
  "firstName",
  "lastName",
  "organization",
  "phoneRaw",
  "emailRaw",
  "city",
  "district",
  "branch",
  "note",
] as const;
export type ProspectTextField = (typeof PROSPECT_TEXT_FIELDS)[number];

/**
 * POST /api/crm/prospects/{id}/convert — "Sıcağa taşı". `addNote`: kişinin program / tür ve notu adaya CRM notu
 * olarak yazılır (metni sunucu kişinin kaydından kurar; istemci serbest metin göndermez).
 */
export const prospectConvertSchema = z.object({
  status: z.enum(MOVE_STATUSES),
  addNote: z.boolean().default(false),
});
export type ProspectConvertInput = z.input<typeof prospectConvertSchema>;

/**
 * POST /api/crm/prospect-lists/{id}/prospects — listeye TEK kişiyi elle ekleme ("Kişi ekle"). Alanlar içe aktarmayla
 * aynı (ham telefon / e-posta; normalize değeri sunucu hesaplar). İçe aktarmadan farkı: elle girilen telefon / e-posta
 * geçerli olmalı (içe aktarmada geçersiz değer ham olarak saklanır), en az bir kimlik alanı dolu olmalı
 * (SQL: crm_prospects_identity_check). Aynı listede aynı telefon / e-posta → 409 PROSPECT_DUPLICATE (benzersiz dizin).
 */
export const prospectCreateSchema = z
  .object({
    firstName: text(IMPORT_FIELD_LIMITS.firstName).default(""),
    lastName: text(IMPORT_FIELD_LIMITS.lastName).default(""),
    organization: text(IMPORT_FIELD_LIMITS.organization).default(""),
    phoneRaw: text(IMPORT_FIELD_LIMITS.phoneRaw).default(""),
    emailRaw: text(IMPORT_FIELD_LIMITS.emailRaw).default(""),
    city: text(IMPORT_FIELD_LIMITS.city).default(""),
    district: text(IMPORT_FIELD_LIMITS.district).default(""),
    branch: text(IMPORT_FIELD_LIMITS.branch).default(""),
    note: text(IMPORT_FIELD_LIMITS.note).default(""),
  })
  .superRefine((v, ctx) => {
    const filled = (s: string) => s.trim().length > 0;
    if (![v.firstName, v.lastName, v.organization, v.phoneRaw, v.emailRaw].some(filled)) {
      ctx.addIssue({ code: "custom", path: ["organization"], message: MSG.identity });
    }
    if (filled(v.phoneRaw) && !normalizeImportPhone(v.phoneRaw)) ctx.addIssue({ code: "custom", path: ["phoneRaw"], message: MSG.phone });
    if (filled(v.emailRaw) && !normalizeImportEmail(v.emailRaw)) ctx.addIssue({ code: "custom", path: ["emailRaw"], message: MSG.email });
  });
export type ProspectCreateInput = z.input<typeof prospectCreateSchema>;
export type ProspectCreateValues = z.output<typeof prospectCreateSchema>;

/**
 * POST /api/crm/leads/{id}/cold-list — "Soğuk listeye geri gönder". Aday SİLİNMEZ: "Satış olmadı" (OLUMSUZ) olur,
 * bu yüzden kayıp nedeni zorunlu (aday statü kuralı); kişi seçilen listeye "Aranmadı" olarak döner.
 */
export const leadToColdListSchema = z.object({
  listId: z.uuid(MSG.list),
  lostReason: z.enum(LOST_REASONS, MSG.lostReason),
});
export type LeadToColdListInput = z.input<typeof leadToColdListSchema>;

/** GET /api/crm/prospects?listId&page&size */
export const PROSPECT_PAGE_MAX = 1000;
export const prospectQuerySchema = z.object({
  listId: z.uuid(),
  page: z.coerce.number().int().min(0).max(10_000).default(0),
  size: z.coerce.number().int().min(1).max(PROSPECT_PAGE_MAX).default(PROSPECT_PAGE_MAX),
});
