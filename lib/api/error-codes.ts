/**
 * Sunucunun döndürdüğü hata kodları ({ error: { code, fields? } }). Ekrandaki metin
 * messages/tr.json → errors.codes.<KOD>. Ham veritabanı mesajı istemciye hiç gönderilmez.
 */
export const API_ERROR_CODES = [
  "UNAUTHORIZED",
  "NOT_STAFF",
  "FORBIDDEN",
  "VALIDATION",
  "NOT_FOUND",
  "CONFIG_MISSING",
  "INTERNAL",
  "EMAIL_TAKEN",
  "INSTITUTION_NAME_TAKEN",
  "ALREADY_ENROLLED",
  "NOT_ENROLLED",
  "ALREADY_PAID",
  "NOT_PAID",
  "NOT_DEMO",
  "BILLING_REQUIRED",
  "CONTACT_INVALID",
  "TAX_ID_INVALID",
  "LICENSE_REQUIRED",
  "LICENSE_INVALID",
  "LICENSE_OVERLAP",
  "DEMO_INVALID",
  "HAS_FINANCIAL_RECORDS",
  "STAFF_EXISTS",
  "SELF_CHANGE",
  "LAST_ADMIN",
  "LEAD_IDENTITY_REQUIRED",
  "LEAD_ALREADY_LINKED",
  "LEAD_INSTITUTION_TAKEN",
  "LEAD_NOT_LINKED",
  "NOTE_NOT_OWNER",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** { error: { code, fields } } — `fields`: alan adı → Türkçe doğrulama mesajı (VALIDATION). */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; fields?: Record<string, string> };
}
