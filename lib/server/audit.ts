import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { StaffContext } from "@/lib/api/server";
import type { AuditAction, AuditEntityType } from "@/lib/domain/activity/audit-actions";

/**
 * CRM işlem kaydı (crm_audit_logs — yalnız eklenir, değiştirilemez). Her yazma işlemi başarıdan sonra
 * buraya bir satır yazar; Aktivite geçmişi bunu okur.
 *
 * KURAL: `details`'e kişisel veri (TC, VKN, adres, telefon, e-posta, şifre) YAZILMAZ — kimlik, durum ve
 * tutar gibi kısa özetler yeter. Kayıt yazılamazsa asıl işlem geri alınmaz (yapılmış bir işlemi, günlüğü
 * tutulamadı diye bozmak daha kötü); hata sunucu loguna düşer.
 */
export type { AuditAction, AuditEntityType } from "@/lib/domain/activity/audit-actions";

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, string | number | boolean | null>;
}

/**
 * Oturumsuz (zamanlayıcı) işlemlerin kaydı: aktör yok, ad "Zamanlayıcı". Yalnız rapor dağıtıcısı kullanır
 * (POST /api/cron/reports). Aynı kural: `details`'e kişisel veri yazılmaz.
 */
export async function recordSystemAudit(entry: AuditEntry, actorName = "Zamanlayıcı"): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from("crm_audit_logs")
    .insert({
      actor_id: null,
      actor_name: actorName,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      details: entry.details ?? {},
    });
  if (error) console.error(`[audit] yazılamadı: ${entry.action} (${error.code ?? "?"})`);
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
