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
  "LIST_PRICE_MISSING",
  "SALE_INVOICED",
  "DEMO_INVALID",
  "HAS_FINANCIAL_RECORDS",
  "STAFF_EXISTS",
  "SELF_CHANGE",
  "LAST_ADMIN",
  "LEAD_IDENTITY_REQUIRED",
  "LEAD_ALREADY_LINKED",
  "LEAD_INSTITUTION_TAKEN",
  "LEAD_NOT_LINKED",
  "OFFER_AMOUNT_REQUIRED",
  "SALE_AMOUNT_REQUIRED",
  "SALE_ACCOUNT_REQUIRED",
  "NOTE_NOT_OWNER",
  "TASK_NOT_FOUND",
  "TASK_ALREADY_DONE",
  "TASK_NOT_DONE",
  "TASK_NOT_ASSIGNEE",
  "TASK_NOT_COMPLETER",
  "TASK_ASSIGNEE_INVALID",
  "TASK_PAST_DUE",
  "TASK_DUPLICATE",
  "TASK_NO_LEAD",
  "LEAD_MERGE_BOTH_LINKED",
  "TICKET_ASSIGNEE_INVALID",
  "APPOINTMENT_PAST",
  "APPOINTMENT_CLOSED",
  "APPOINTMENT_ASSIGNEE_INVALID",
  "PAYLOAD_TOO_LARGE",
  "PROSPECT_ALREADY_MOVED",
  "PROSPECT_DUPLICATE",
  "SURVEY_EXPIRED",
  "SURVEY_ANSWERED",
  "SURVEY_NO_CONTACT",
  "MAIL_NOT_CONFIGURED",
  "MAIL_SEND_FAILED",
  "PROVIDER_NOT_CONFIGURED",
  "INVOICE_NOT_RETRYABLE",
  "INVOICE_PDF_NOT_READY",
  "PROVIDER_ERROR",
  "BILLING_PROFILE_INCOMPLETE",
  "RATE_LIMITED",
  "COST_BUDGET_EXISTS",
  "REPORT_RECIPIENT_INVALID",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** { error: { code, fields } } — `fields`: alan adı → Türkçe doğrulama mesajı (VALIDATION). */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; fields?: Record<string, string> };
}
