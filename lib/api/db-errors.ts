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

/** supabase/migrations/*.sql içindeki `raise exception 'CRM_…'` kodları. */
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
  // 20260929170000_crm_tasks
  CRM_TASK_NOT_FOUND: [404, "TASK_NOT_FOUND"],
  CRM_TASK_ALREADY_DONE: [409, "TASK_ALREADY_DONE"],
  CRM_TASK_NOT_DONE: [409, "TASK_NOT_DONE"],
  CRM_TASK_NOT_ASSIGNEE: [403, "TASK_NOT_ASSIGNEE"],
  CRM_TASK_NOT_COMPLETER: [403, "TASK_NOT_COMPLETER"],
  CRM_TASK_ASSIGNEE_INVALID: [422, "TASK_ASSIGNEE_INVALID"],
  CRM_TASK_PAST_DUE: [400, "TASK_PAST_DUE"],
  CRM_TASK_LEAD_NOT_FOUND: [404, "NOT_FOUND"],
  CRM_TASK_INVALID: [400, "VALIDATION"],
  CRM_TASK_ACTOR_REQUIRED: [400, "VALIDATION"],
  // 20260929180000_crm_prospects
  CRM_PROSPECT_LIST_NOT_FOUND: [404, "NOT_FOUND"],
  CRM_PROSPECT_NOT_FOUND: [404, "NOT_FOUND"],
  CRM_PROSPECT_ALREADY_MOVED: [409, "PROSPECT_ALREADY_MOVED"],
  CRM_PROSPECT_STATUS_INVALID: [400, "VALIDATION"],
  CRM_PROSPECT_INVALID: [400, "VALIDATION"],
  CRM_PROSPECT_BATCH_TOO_LARGE: [413, "PAYLOAD_TOO_LARGE"],
  CRM_PROSPECT_ACTOR_REQUIRED: [400, "VALIDATION"],
  // 20260929190000_crm_surveys (herkese açık uçlar: geçersiz token 404, süresi dolmuş 410, yanıtlanmış 409 — asla 401)
  CRM_SURVEY_NOT_FOUND: [404, "NOT_FOUND"],
  CRM_SURVEY_LEAD_NOT_FOUND: [404, "NOT_FOUND"],
  CRM_SURVEY_EXPIRED: [410, "SURVEY_EXPIRED"],
  CRM_SURVEY_ANSWERED: [409, "SURVEY_ANSWERED"],
  CRM_SURVEY_ANSWER_INVALID: [400, "VALIDATION"],
  CRM_SURVEY_RECIPIENT_REQUIRED: [400, "VALIDATION"],
  CRM_SURVEY_ACTOR_REQUIRED: [400, "VALIDATION"],
  CRM_SURVEY_INVALID: [400, "VALIDATION"],
  // 20260929200000_crm_invoices
  CRM_INVOICE_SALE_MISMATCH: [400, "VALIDATION"],
  CRM_INVOICE_IMMUTABLE: [409, "VALIDATION"],
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
  // 20260929200000_crm_invoices: fatura profili (form + sunucu zaten doğrular; buraya düşerse alan hatası gibi)
  crm_institutions_billing_type_check: [422, "VALIDATION"],
  crm_institutions_billing_text_check: [422, "VALIDATION"],
  crm_institutions_postal_code_check: [422, "VALIDATION"],
  crm_institutions_billing_email_check: [422, "VALIDATION"],
  crm_institutions_tax_office_vkn_check: [422, "VALIDATION"],
  crm_institutions_billing_profile_check: [422, "BILLING_PROFILE_INCOMPLETE"],
  crm_licenses_one_year_check: [422, "LICENSE_INVALID"],
  crm_licenses_institution_id_fkey: [409, "HAS_FINANCIAL_RECORDS"],
  crm_payments_institution_id_fkey: [409, "HAS_FINANCIAL_RECORDS"],
  // 20260929160000_crm_leads
  crm_leads_identity_check: [422, "LEAD_IDENTITY_REQUIRED"],
  crm_leads_contact_phone_check: [422, "CONTACT_INVALID"],
  crm_leads_contact_email_check: [422, "CONTACT_INVALID"],
  crm_leads_status_check: [400, "VALIDATION"],
  crm_leads_source_check: [400, "VALIDATION"],
  crm_leads_offer_amount_check: [400, "VALIDATION"],
  crm_leads_sale_amount_check: [400, "VALIDATION"],
  crm_leads_lost_reason_check: [400, "VALIDATION"],
  crm_leads_sold_at_check: [400, "VALIDATION"],
  crm_leads_length_check: [400, "VALIDATION"],
  crm_leads_institution_id_key: [409, "LEAD_INSTITUTION_TAKEN"],
  crm_notes_content_check: [400, "VALIDATION"],
  crm_notes_lead_id_fkey: [404, "NOT_FOUND"],
  // 20260929170000_crm_tasks
  crm_tasks_lead_id_fkey: [404, "NOT_FOUND"],
  crm_tasks_task_key_key: [409, "TASK_ALREADY_DONE"],
  crm_tasks_kind_check: [400, "VALIDATION"],
  crm_tasks_status_check: [400, "VALIDATION"],
  crm_tasks_outcome_check: [400, "VALIDATION"],
  crm_tasks_assignment_type_check: [400, "VALIDATION"],
  crm_tasks_subject_check: [400, "VALIDATION"],
  crm_tasks_rule_done_check: [400, "VALIDATION"],
  crm_tasks_key_check: [400, "VALIDATION"],
  crm_tasks_assigned_fields_check: [400, "VALIDATION"],
  crm_tasks_done_check: [400, "VALIDATION"],
  crm_tasks_note_check: [400, "VALIDATION"],
  crm_rules_id_check: [400, "VALIDATION"],
  crm_rules_days_check: [400, "VALIDATION"],
  crm_rules_scheduled_check: [400, "VALIDATION"],
  // 20260929180000_crm_prospects
  crm_prospect_lists_name_check: [400, "VALIDATION"],
  crm_prospect_lists_source_file_check: [400, "VALIDATION"],
  crm_prospects_list_id_fkey: [404, "NOT_FOUND"],
  crm_prospects_outcome_check: [400, "VALIDATION"],
  crm_prospects_outcome_at_check: [400, "VALIDATION"],
  crm_prospects_identity_check: [400, "VALIDATION"],
  crm_prospects_phone_check: [400, "VALIDATION"],
  crm_prospects_email_check: [400, "VALIDATION"],
  crm_prospects_moved_check: [400, "VALIDATION"],
  crm_prospects_length_check: [400, "VALIDATION"],
  crm_prospects_list_phone_key: [409, "PROSPECT_DUPLICATE"],
  crm_prospects_list_email_key: [409, "PROSPECT_DUPLICATE"],
  // 20260929190000_crm_surveys
  crm_survey_invitations_survey_id_fkey: [404, "NOT_FOUND"],
  crm_survey_invitations_lead_id_fkey: [404, "NOT_FOUND"],
  crm_survey_invitations_contact_check: [422, "SURVEY_NO_CONTACT"],
  crm_survey_invitations_email_check: [422, "CONTACT_INVALID"],
  crm_survey_invitations_phone_check: [422, "CONTACT_INVALID"],
  crm_survey_invitations_token_check: [400, "VALIDATION"],
  crm_survey_invitations_channel_check: [400, "VALIDATION"],
  crm_survey_invitations_status_check: [400, "VALIDATION"],
  crm_survey_invitations_state_check: [400, "VALIDATION"],
  crm_survey_invitations_length_check: [400, "VALIDATION"],
  crm_survey_responses_invitation_key: [409, "SURVEY_ANSWERED"],
  crm_survey_responses_nps_check: [400, "VALIDATION"],
  crm_survey_responses_csat_check: [400, "VALIDATION"],
  crm_survey_responses_comment_check: [400, "VALIDATION"],
  crm_survey_responses_answer_check: [400, "VALIDATION"],
  // 20260929200000_crm_invoices
  crm_invoices_institution_id_fkey: [404, "NOT_ENROLLED"],
  crm_invoices_payment_id_fkey: [409, "HAS_FINANCIAL_RECORDS"],
  crm_invoices_license_id_fkey: [409, "HAS_FINANCIAL_RECORDS"],
  crm_invoices_sale_ref_check: [400, "VALIDATION"],
  crm_invoices_mode_check: [400, "VALIDATION"],
  crm_invoices_provider_check: [400, "VALIDATION"],
  crm_invoices_type_check: [400, "VALIDATION"],
  crm_invoices_recipients_check: [400, "VALIDATION"],
  crm_invoices_amount_check: [400, "VALIDATION"],
  crm_invoices_vat_rate_check: [400, "VALIDATION"],
  crm_invoices_vat_sum_check: [400, "VALIDATION"],
  crm_invoices_currency_check: [400, "VALIDATION"],
  crm_invoices_status_check: [400, "VALIDATION"],
  crm_invoices_state_check: [400, "VALIDATION"],
  crm_invoices_attempts_check: [400, "VALIDATION"],
  crm_invoices_text_check: [400, "VALIDATION"],
  // 20260929220000_crm_costs
  crm_cost_entries_service_check: [400, "VALIDATION"],
  crm_cost_entries_period_check: [400, "VALIDATION"],
  crm_cost_entries_amount_check: [400, "VALIDATION"],
  crm_cost_entries_currency_check: [400, "VALIDATION"],
  crm_cost_entries_fx_check: [400, "VALIDATION"],
  crm_cost_entries_note_check: [400, "VALIDATION"],
  crm_cost_entries_source_check: [400, "VALIDATION"],
  crm_cost_budgets_scope_check: [400, "VALIDATION"],
  crm_cost_budgets_service_check: [400, "VALIDATION"],
  crm_cost_budgets_limit_check: [400, "VALIDATION"],
  crm_cost_budgets_soft_check: [400, "VALIDATION"],
  crm_cost_budgets_hard_check: [400, "VALIDATION"],
  crm_cost_budgets_note_check: [400, "VALIDATION"],
  crm_cost_budgets_active_scope_key: [409, "COST_BUDGET_EXISTS"],
  crm_cost_settings_sms_price_check: [400, "VALIDATION"],
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
