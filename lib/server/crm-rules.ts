import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { dbError, type StaffContext } from "@/lib/api/server";
import { describeRuleChanges, normalizeRules, type RuleConfig } from "@/lib/domain/tasks/rules";
import { recordAudit } from "./audit";

/**
 * Takip kuralları (crm_rules — Madde 12). Okuma her CRM kullanıcısına açık (Görevlerim, aday formunun önerdiği
 * arama günü); yazma yalnız ADMIN (uç denetler). Bilinmeyen satır yok sayılır, eksik kural varsayılanla tamamlanır.
 */

export async function getRules(): Promise<RuleConfig[]> {
  const { data, error } = await getSupabaseAdminClient().from("crm_rules").select("id, enabled, days");
  if (error) throw dbError(error);
  return normalizeRules(data ?? []);
}

/**
 * Kuralları kaydeder. Gövdede olmayan kural mevcut değerini korur (varsayılana dönmez); yalnız değişen satırlar
 * tek ifadeyle yazılır. Değişiklik yoksa hiçbir şey yazılmaz. İşlem kaydına yalnız "kural.alan eski→yeni".
 */
export async function saveRules(input: RuleConfig[], staff: StaffContext): Promise<RuleConfig[]> {
  const before = await getRules();
  const next = normalizeRules([...before, ...input]);
  const changes = describeRuleChanges(before, next);
  if (changes.length === 0) return before;
  const changedIds = new Set(changes.map((c) => c.split(".")[0]));
  const { error } = await getSupabaseAdminClient()
    .from("crm_rules")
    .upsert(
      next.filter((r) => changedIds.has(r.id)).map((r) => ({ id: r.id, enabled: r.enabled, days: r.days, updated_by: staff.userId })),
      { onConflict: "id" }
    );
  if (error) throw dbError(error);
  await recordAudit(staff, {
    action: "RULES_UPDATED",
    entityType: "rules",
    details: { changes: changes.join(", ") },
  });
  return getRules();
}
