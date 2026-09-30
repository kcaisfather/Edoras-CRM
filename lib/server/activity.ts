import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/api/server";
import { istanbulRange, type InstitutionEventsQuery, type InstitutionEventsResponse } from "@/lib/domain/activity/events";
import { sanitizeAuditDetails, type AuditLogEntry, type AuditLogPage, type AuditLogsQuery } from "@/lib/domain/activity/audit-logs";
import { listEdorasInstitutions } from "./edoras";
import { listInstitutionEvents } from "./edoras-usage";
import { internalInstitutionIds } from "./internal-institutions";
import { pgChain } from "./pg-chain";

/**
 * Aktivite geçmişi servisi. İki kapsam, ikisi de yalnız ADMIN (uçlar denetler):
 *  - Kurum etkinliği: Edoras kurum olayları (salt okunur; lib/server/edoras-usage.ts → listInstitutionEvents). İç / sunum
 *    kurumları, kurum seçilmemişken zaman çizelgesinden çıkarılır (metriklerle aynı kural); tek tek seçilirse görünür.
 *  - CRM işlem kaydı: crm_audit_logs (yalnız eklenir). `details` okurken yine temizlenir (düz değerler, kısaltılmış).
 */

export async function getInstitutionEvents(query: InstitutionEventsQuery): Promise<InstitutionEventsResponse> {
  const internal = query.institutionId ? new Set<string>() : await internalInstitutionIds();
  return listInstitutionEvents(query, [...internal]);
}

/** Kurum süzgeci seçenekleri: Edoras'taki iç olmayan kurumlar (ada göre). */
export async function listActivityInstitutions(): Promise<{ id: string; name: string }[]> {
  const [institutions, internal] = await Promise.all([listEdorasInstitutions(), internalInstitutionIds()]);
  return institutions.filter((i) => !internal.has(i.id)).map((i) => ({ id: i.id, name: i.name }));
}

const AUDIT_COLUMNS = "id, created_at, actor_id, actor_name, action, entity_type, entity_id, entity_label, details";

interface AuditRow {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: unknown;
}

export async function listAuditLogs(query: AuditLogsQuery): Promise<AuditLogPage> {
  let chain = pgChain(getSupabaseAdminClient().from("crm_audit_logs").select(AUDIT_COLUMNS, { count: "exact" }));
  if (query.actorId) chain = chain.eq("actor_id", query.actorId);
  if (query.action) chain = chain.eq("action", query.action);
  if (query.entityType) chain = chain.eq("entity_type", query.entityType);
  if (query.from) chain = chain.gte("created_at", istanbulRange(query.from, query.from).start);
  if (query.to) chain = chain.lt("created_at", istanbulRange(query.to, query.to).end);

  const offset = query.page * query.size;
  const { data, error, count } = await chain
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + query.size - 1);
  if (error) throw dbError(error);

  const items: AuditLogEntry[] = ((data ?? []) as unknown as AuditRow[]).map((r) => ({
    id: r.id,
    at: r.created_at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityLabel: r.entity_label,
    details: sanitizeAuditDetails(r.details),
  }));
  return { items, total: count ?? 0, page: query.page, size: query.size };
}
