/**
 * Veritabanı hatası → API hata kodu. Saf fonksiyon (test edilir).
 * ⚠️ PostgREST hatasının `details` alanı CHECK ihlalinde satırın TAMAMINI taşır (TC, adres…);
 * o alan ne istemciye ne loga yazılır — yalnız kod ve kısıt adı kullanılır.
 */
import type { ApiErrorCode } from "./error-codes";

export interface DbErrorLike {
  code?: string;
  message?: string;
}

export interface MappedDbError {
  status: number;
  code: ApiErrorCode;
  /** Log için güvenli özet (kısıt adı / iş kuralı kodu). */
  reason: string;
}

/** supabase/migrations/20260929120000_crm_core.sql içindeki `raise exception 'CRM_…'` kodları. */
const RAISED: Record<string, [number, ApiErrorCode]> = {
  CRM_INSTITUTION_NAME_REQUIRED: [400, "VALIDATION"],
  CRM_INSTITUTION_NAME_TAKEN: [409, "INSTITUTION_NAME_TAKEN"],
  CRM_INSTITUTION_NOT_FOUND: [404, "NOT_FOUND"],
  CRM_DEMO_START_REQUIRED: [400, "DEMO_INVALID"],
  CRM_ALREADY_ENROLLED: [409, "ALREADY_ENROLLED"],
  CRM_NOT_ENROLLED: [404, "NOT_ENROLLED"],
  CRM_ALREADY_PAID: [409, "ALREADY_PAID"],
  CRM_NOT_PAID: [409, "NOT_PAID"],
  CRM_NOT_DEMO: [409, "NOT_DEMO"],
  CRM_LICENSE_REQUIRED: [400, "LICENSE_REQUIRED"],
  CRM_LICENSE_OVERLAP: [409, "LICENSE_OVERLAP"],
  CRM_LICENSE_MISMATCH: [400, "VALIDATION"],
  CRM_BILLING_REQUIRED: [422, "BILLING_REQUIRED"],
  CRM_STATUS_INVALID: [400, "VALIDATION"],
  CRM_LAST_ADMIN: [409, "LAST_ADMIN"],
};

/** CHECK / FK kısıt adı → kod. */
const CONSTRAINTS: Record<string, [number, ApiErrorCode]> = {
  crm_institutions_paid_billing_check: [422, "BILLING_REQUIRED"],
  crm_institutions_address_check: [422, "BILLING_REQUIRED"],
  crm_institutions_tc_no_check: [422, "TAX_ID_INVALID"],
  crm_institutions_tax_no_check: [422, "TAX_ID_INVALID"],
  crm_institutions_contact_name_check: [422, "CONTACT_INVALID"],
  crm_institutions_contact_phone_check: [422, "CONTACT_INVALID"],
  crm_institutions_contact_email_check: [422, "CONTACT_INVALID"],
  crm_institutions_demo_dates_check: [422, "DEMO_INVALID"],
  crm_licenses_one_year_check: [422, "LICENSE_INVALID"],
  crm_licenses_institution_id_fkey: [409, "HAS_FINANCIAL_RECORDS"],
  crm_payments_institution_id_fkey: [409, "HAS_FINANCIAL_RECORDS"],
};

export function mapDbError(err: DbErrorLike): MappedDbError {
  const message = err.message ?? "";

  // raise exception 'CRM_…' → PostgREST P0001, mesaj = kod.
  const raised = /\bCRM_[A-Z_]+\b/.exec(message)?.[0];
  if (raised && RAISED[raised]) {
    const [status, code] = RAISED[raised];
    return { status, code, reason: raised };
  }

  const constraint = /constraint "([^"]+)"/.exec(message)?.[1];
  if (constraint && CONSTRAINTS[constraint]) {
    const [status, code] = CONSTRAINTS[constraint];
    return { status, code, reason: constraint };
  }

  // Tablo/fonksiyon yok → migration uygulanmamış (PGRST205/PGRST202: şema önbelleğinde yok, 42P01/42883: Postgres).
  if (err.code && ["PGRST205", "PGRST202", "42P01", "42883"].includes(err.code)) {
    return { status: 503, code: "CONFIG_MISSING", reason: `schema:${err.code}` };
  }

  return { status: 500, code: "INTERNAL", reason: `db:${err.code ?? "unknown"}${constraint ? `:${constraint}` : ""}` };
}
