/**
 * CRM işlem kaydı (crm_audit_logs) eylem ve kayıt türleri — tek kaynak. `lib/server/audit.ts` tipleri buradan alır;
 * Aktivite geçmişi süzgeçleri ve etiketleri (messages/features/activity.tr.json → activityHistory.audit.actions / entities)
 * aynı listeden kurulur. Yeni bir eylem eklenince BURAYA ve mesaj dosyasına eklenir (activity.test.ts eksik etiketi yakalar).
 */
export const AUDIT_ACTIONS = [
  "DEMO_CREATED",
  "INSTITUTION_ENROLLED",
  "CONVERTED_TO_PAID",
  "LICENSE_RENEWED",
  "CONTACT_UPDATED",
  "BILLING_UPDATED",
  "PAYMENT_RECORDED",
  "STAFF_CREATED",
  "STAFF_ROLE_CHANGED",
  "STAFF_DISABLED",
  "STAFF_ENABLED",
  "STAFF_PASSWORD_RESET",
  "INTERNAL_MARKED",
  "INTERNAL_UNMARKED",
  "LEAD_CREATED",
  "LEAD_UPDATED",
  "LEAD_OWNER_CHANGED",
  "LEAD_STATUS_CHANGED",
  "LEAD_DELETED",
  // Birleştirme: silinen adayın kimliği ve taşınan satır sayıları yazılır; ad, telefon, e-posta yazılmaz.
  "LEADS_MERGED",
  "LEAD_LINKED",
  "LEAD_UNLINKED",
  "NOTE_CREATED",
  "NOTE_UPDATED",
  "NOTE_DELETED",
  "TASK_ASSIGNED",
  "TASK_COMPLETED",
  "TASK_REOPENED",
  "RULES_UPDATED",
  "PROSPECT_LIST_CREATED",
  "PROSPECT_LIST_DELETED",
  "PROSPECTS_IMPORTED",
  "PROSPECT_UPDATED",
  "PROSPECT_DELETED",
  "PROSPECT_CONVERTED",
  "LEADS_IMPORTED",
  // Anketler: e-posta / telefon / yorum yazılmaz; kanal ve bağlı aday / kurum kimliği yeter. Müşterinin (herkese açık
  // sayfadan) yanıtı işlem kaydına yazılmaz — personel işlemi değildir ve kişisel veri taşır.
  "SURVEY_INVITATION_CREATED",
  "SURVEY_INVITATION_SENT",
  "SURVEY_INVITATION_RESENT",
  // Faturalar: tutar, yöntem, durum ve satış referansı yazılır; alıcı e-postası, adres, TC/VKN, unvan yazılmaz.
  "INVOICE_CREATED",
  "INVOICE_ISSUED",
  "INVOICE_FAILED",
  "INVOICE_RETRIED",
  // Maliyetler: hizmet, ay, tutar ve para birimi yazılır; not (serbest metin) yazılmaz.
  "COST_ENTRY_CREATED",
  "COST_ENTRY_UPDATED",
  "COST_ENTRY_DELETED",
  "COST_ENTRIES_IMPORTED",
  "COST_BUDGET_CREATED",
  "COST_BUDGET_UPDATED",
  "COST_BUDGET_DELETED",
  "COST_SETTINGS_UPDATED",
  // Raporlar: abonelik adı, sıklık, saat ve alıcı / bölüm sayısı yazılır; alıcı adresi ve rapor içeriği yazılmaz.
  "REPORT_SUBSCRIPTION_CREATED",
  "REPORT_SUBSCRIPTION_UPDATED",
  "REPORT_SUBSCRIPTION_DELETED",
  "REPORT_SENT",
  // Randevular: tarih, saat, tür ve sonuç yazılır; link, yer ve not (serbest metin / adres) yazılmaz.
  "APPOINTMENT_CREATED",
  "APPOINTMENT_RESCHEDULED",
  "APPOINTMENT_CLOSED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  "institution",
  "staff",
  "lead",
  "note",
  "task",
  "rules",
  "prospect_list",
  "prospect",
  "survey_invitation",
  "invoice",
  "cost_entry",
  "cost_budget",
  "cost_settings",
  "report_subscription",
  "appointment",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export function isAuditEntityType(value: unknown): value is AuditEntityType {
  return typeof value === "string" && (AUDIT_ENTITY_TYPES as readonly string[]).includes(value);
}
