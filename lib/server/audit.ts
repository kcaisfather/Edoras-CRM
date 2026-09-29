import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { StaffContext } from "@/lib/api/server";

/**
 * CRM işlem kaydı (crm_audit_logs — yalnız eklenir, değiştirilemez). Her yazma işlemi başarıdan sonra
 * buraya bir satır yazar; Aktivite geçmişi bunu okur.
 *
 * KURAL: `details`'e kişisel veri (TC, VKN, adres, telefon, e-posta, şifre) YAZILMAZ — kimlik, durum ve
 * tutar gibi kısa özetler yeter. Kayıt yazılamazsa asıl işlem geri alınmaz (yapılmış bir işlemi, günlüğü
 * tutulamadı diye bozmak daha kötü); hata sunucu loguna düşer.
 */
export type AuditAction =
  | "DEMO_CREATED"
  | "INSTITUTION_ENROLLED"
  | "CONVERTED_TO_PAID"
  | "LICENSE_RENEWED"
  | "CONTACT_UPDATED"
  | "BILLING_UPDATED"
  | "PAYMENT_RECORDED"
  | "STAFF_CREATED"
  | "STAFF_ROLE_CHANGED"
  | "STAFF_DISABLED"
  | "STAFF_ENABLED"
  | "STAFF_PASSWORD_RESET"
  | "INTERNAL_MARKED"
  | "INTERNAL_UNMARKED"
  | "LEAD_CREATED"
  | "LEAD_UPDATED"
  | "LEAD_STATUS_CHANGED"
  | "LEAD_DELETED"
  | "LEAD_LINKED"
  | "LEAD_UNLINKED"
  | "NOTE_CREATED"
  | "NOTE_UPDATED"
  | "NOTE_DELETED";

export type AuditEntityType = "institution" | "staff" | "lead" | "note";

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, string | number | boolean | null>;
}

export async function recordAudit(staff: StaffContext, entry: AuditEntry): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from("crm_audit_logs")
    .insert({
      actor_id: staff.userId,
      actor_name: staff.fullName ?? staff.email,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      details: entry.details ?? {},
    });
  if (error) console.error(`[audit] yazılamadı: ${entry.action} (${error.code ?? "?"})`);
}
