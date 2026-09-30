import { apiRequest } from "@/lib/api/client";
import type { AuditLogPage } from "@/lib/domain/activity/audit-logs";
import type { InstitutionEventsResponse } from "@/lib/domain/activity/events";

export interface EventFilters {
  institutionId: string;
  type: string;
  from: string;
  to: string;
  page: number;
  size: number;
}

export interface AuditFilters {
  actorId: string;
  action: string;
  entityType: string;
  from: string;
  to: string;
  page: number;
  size: number;
}

const qs = (params: Record<string, string | number | null | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/**
 * Aktivite geçmişi uçları (yalnız ADMIN):
 *   GET /api/activity/institution-events?institutionId&types&from&to&page&size → InstitutionEventsResponse (Edoras, salt okunur)
 *   GET /api/activity/institutions → { id, name }[] (kurum süzgeci)
 *   GET /api/activity/audit-logs?actorId&action&entityType&from&to&page&size → AuditLogPage (crm_audit_logs)
 */
export const activityApi = {
  events: (f: EventFilters, signal?: AbortSignal) =>
    apiRequest<InstitutionEventsResponse>(
      `/api/activity/institution-events${qs({ institutionId: f.institutionId, types: f.type, from: f.from, to: f.to, page: f.page, size: f.size })}`,
      { signal }
    ),
  institutions: (signal?: AbortSignal) => apiRequest<{ id: string; name: string }[]>("/api/activity/institutions", { signal }),
  auditLogs: (f: AuditFilters, signal?: AbortSignal) =>
    apiRequest<AuditLogPage>(
      `/api/activity/audit-logs${qs({ actorId: f.actorId, action: f.action, entityType: f.entityType, from: f.from, to: f.to, page: f.page, size: f.size })}`,
      { signal }
    ),
};
