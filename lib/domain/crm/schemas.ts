/**
 * Aday API doğrulaması (tek kaynak): istemci formları ve sunucu uçları aynı şemaları kullanır. Panel yalnız
 * Türkçe olduğu için mesajlar burada Türkçe. `created_by` / `updated_by` / `author_id` gibi aktör alanları
 * şemada YOKTUR: gövdede gelirse atılır, sunucu oturumdan yazar (G09 kural 2).
 * Kurallar veritabanında da zorunlu (supabase/migrations/20260929160000_crm_leads.sql).
 */
import { z } from "zod";
import { normalizeTrPhone } from "@/lib/utils/phone";
import { isIsoDate } from "@/lib/domain/institutions/rules";
import { COMPETITOR_NAME_MAX, LOST_NOTE_MAX } from "./loss-detail";
import { CRM_STATUSES, LEAD_SOURCES, LOST_REASONS } from "./types";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const MSG = {
  identity: "Kurum adı ya da yetkilinin adı zorunlu",
  tooLong: "Çok uzun",
  phoneInvalid: "Geçerli bir telefon girin (05XX XXX XX XX)",
  emailInvalid: "Geçerli bir e-posta adresi girin",
  date: "Geçerli bir tarih seçin",
  amount: "Geçerli bir tutar girin",
  noteEmpty: "Not boş olamaz",
  noteLong: "Not en fazla 5000 karakter olabilir",
} as const;

/** numeric(12, 2) üst sınırı. */
const MAX_AMOUNT = 9_999_999_999.99;

const text = (max: number) => z.string().trim().max(max, MSG.tooLong);
const phone = z
  .string()
  .trim()
  .refine((v) => v === "" || normalizeTrPhone(v) !== null, MSG.phoneInvalid);
const email = z
  .string()
  .trim()
  .max(254, MSG.tooLong)
  .refine((v) => v === "" || EMAIL.test(v), MSG.emailInvalid);
const isoDateOrNull = z
  .string()
  .nullable()
  .refine((v) => v === null || v === "" || isIsoDate(v), MSG.date)
  .transform((v) => (v ? v : null));
const amount = z
  .number(MSG.amount)
  .min(0, MSG.amount)
  .max(MAX_AMOUNT, MSG.amount)
  .transform((n) => Math.round(n * 100) / 100)
  .nullable();

const contactShape = {
  organizationName: text(200),
  contactFirstName: text(100),
  contactLastName: text(100),
  contactEmail: email,
  contactPhone: phone,
  city: text(100),
  district: text(100),
  country: text(100),
};

const followUpShape = {
  status: z.enum(CRM_STATUSES),
  /** YYYY-MM-DD; boş = yok. */
  nextFollowUpAt: isoDateOrNull,
  lostReason: z.enum(LOST_REASONS).nullable(),
  /**
   * Kayıp ayrıntısı (yalnız "Satış olmadı"; başka statüde sunucu temizler): kayıp notu, rakip adı (yalnız neden
   * COMPETITOR iken kalır), yeniden temas günü. Boş metin = temizle.
   */
  lostNote: z.string().trim().max(LOST_NOTE_MAX, MSG.tooLong).nullable().transform((v) => v || null),
  competitor: z.string().trim().max(COMPETITOR_NAME_MAX, MSG.tooLong).nullable().transform((v) => v || null),
  recallAt: isoDateOrNull,
};

const hasIdentity = (v: { organizationName?: string; contactFirstName?: string; contactLastName?: string }) =>
  !!(v.organizationName?.trim() || v.contactFirstName?.trim() || v.contactLastName?.trim());

/** Yeni aday. Alanların hepsi isteğe bağlı; yalnız kurum adı ya da yetkili adı zorunlu. */
export const leadCreateSchema = z
  .object({
    organizationName: contactShape.organizationName.default(""),
    contactFirstName: contactShape.contactFirstName.default(""),
    contactLastName: contactShape.contactLastName.default(""),
    contactEmail: contactShape.contactEmail.default(""),
    contactPhone: contactShape.contactPhone.default(""),
    city: contactShape.city.default(""),
    district: contactShape.district.default(""),
    country: contactShape.country.default(""),
    status: followUpShape.status.default("ARANACAK"),
    nextFollowUpAt: followUpShape.nextFollowUpAt.default(null),
    lostReason: followUpShape.lostReason.default(null),
    lostNote: followUpShape.lostNote.default(null),
    competitor: followUpShape.competitor.default(null),
    recallAt: followUpShape.recallAt.default(null),
    source: z.enum(LEAD_SOURCES).default("MANUAL"),
    offerAmount: amount.optional(),
    saleAmount: amount.optional(),
    /** Edoras institutions.id ("Yeni kayıtlar" → Aday oluştur). */
    institutionId: z.uuid().nullable().default(null),
  })
  .refine(hasIdentity, { path: ["organizationName"], message: MSG.identity });
export type LeadCreateInput = z.input<typeof leadCreateSchema>;
export type LeadCreateValues = z.output<typeof leadCreateSchema>;

/**
 * Aday güncelleme — KISMİ: gövdede olmayan alana dokunulmaz (EK-3). `status` verilirse sonraki arama ve
 * kayıp nedeni de o statüye göre yazılır (sunucu `applyStatusChange`). Tutarlar CRM_AGENT için yok sayılır.
 */
export const leadPatchSchema = z
  .object({
    ...contactShape,
    ...followUpShape,
    offerAmount: amount,
    saleAmount: amount,
    /** Sorumlu personel (crm_staff.user_id); null = sorumlusuz. Yalnız ADMIN değiştirir (sunucu). */
    ownerId: z.uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Değişiklik yok" });
export type LeadPatchInput = z.input<typeof leadPatchSchema>;
export type LeadPatchValues = z.output<typeof leadPatchSchema>;

export const leadLinkSchema = z.object({ institutionId: z.uuid() });
export type LeadLinkInput = z.input<typeof leadLinkSchema>;

export const noteSchema = z.object({
  content: z.string().trim().min(1, MSG.noteEmpty).max(5000, MSG.noteLong),
});
export type NoteInput = z.input<typeof noteSchema>;

// --- Veritabanı biçimine çeviri (şemadan geçmiş değerlerle) -------------------------------------

type ContactValues = Partial<Record<keyof typeof contactShape, string>>;

/** İletişim alanları → crm_leads kolonları: boş → null, telefon E.164, e-posta küçük harf. Verilmeyen alan yok. */
export function toContactColumns(v: ContactValues): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const set = (column: string, value: string | undefined, map: (s: string) => string | null = (s) => s) => {
    if (value === undefined) return;
    const trimmed = value.trim().replace(/\s+/g, " ");
    out[column] = trimmed ? map(trimmed) : null;
  };
  set("organization_name", v.organizationName);
  set("contact_first_name", v.contactFirstName);
  set("contact_last_name", v.contactLastName);
  set("contact_email", v.contactEmail, (s) => s.toLowerCase());
  set("contact_phone", v.contactPhone, (s) => normalizeTrPhone(s));
  set("city", v.city);
  set("district", v.district);
  set("country", v.country);
  return out;
}

/** Gövdede değişen alan adları (işlem kaydı için; değerler yazılmaz). */
export const CONTACT_FIELDS = Object.keys(contactShape) as (keyof typeof contactShape)[];
