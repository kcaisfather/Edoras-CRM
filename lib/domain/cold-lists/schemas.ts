/**
 * Soğuk liste uçlarının gövde doğrulaması (tek kaynak: istemci ve sunucu). Aktör alanları (created_by) ve sunucunun
 * hesapladığı değerler (normalize telefon / e-posta, outcome_at, moved_at, crm_lead_id) şemada YOKTUR: gövdede
 * gelirse atılır. Kurallar veritabanında da zorunlu (supabase/migrations/20260929180000_crm_prospects.sql).
 * Toplu ekleme gövdesi lib/import/bulk.ts'te.
 */
import { z } from "zod";
import { IMPORT_FIELD_LIMITS } from "@/lib/import/bulk";
import { MOVE_STATUSES, PROSPECT_OUTCOMES } from "./types";

const MSG = {
  name: "Liste adı 1–120 karakter olmalı",
  tooLong: "Çok uzun",
  empty: "Değişiklik yok",
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

/** GET /api/crm/prospects?listId&page&size */
export const PROSPECT_PAGE_MAX = 1000;
export const prospectQuerySchema = z.object({
  listId: z.uuid(),
  page: z.coerce.number().int().min(0).max(10_000).default(0),
  size: z.coerce.number().int().min(1).max(PROSPECT_PAGE_MAX).default(PROSPECT_PAGE_MAX),
});
