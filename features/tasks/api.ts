import { apiRequest } from "@/lib/api/client";
import type { AssignTaskInput, CompleteTaskInput } from "@/lib/domain/tasks/schemas";
import type { CrmTaskDto, TaskStatus, TeamMember } from "@/lib/domain/tasks/types";

/**
 * Görev uçları (Madde 11; DeepSport features/tasks/api.ts sözleşmesinin Next route handler karşılığı):
 *   GET  /api/crm/tasks?from&to&status        → CrmTaskDto[]
 *   POST /api/crm/tasks                       → CrmTaskDto ("Görev ata")
 *   POST /api/crm/tasks/complete              → { taskId } (tek transaction: görev + not + aday)
 *   POST /api/crm/tasks/reopen { taskId }     → "Geri al"
 *   GET  /api/crm/tasks/due-count             → { count } (menü rozeti)
 *   GET  /api/crm/tasks/assignees             → TeamMember[] ("Atanan kişi")
 * Kurallar (GET/PUT /api/crm/rules) crm modülünde (useCrmRules).
 */
export const tasksApi = {
  list: (params: { from?: string; to?: string; status?: TaskStatus }, signal?: AbortSignal) => {
    const sp = new URLSearchParams();
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
    if (params.status) sp.set("status", params.status);
    const qs = sp.toString();
    return apiRequest<CrmTaskDto[]>(`/api/crm/tasks${qs ? `?${qs}` : ""}`, { signal });
  },
  dueCount: (signal?: AbortSignal) => apiRequest<{ count: number }>("/api/crm/tasks/due-count", { signal }),
  assignees: (signal?: AbortSignal) => apiRequest<TeamMember[]>("/api/crm/tasks/assignees", { signal }),
  assign: (body: AssignTaskInput) => apiRequest<CrmTaskDto>("/api/crm/tasks", { method: "POST", body }),
  complete: (body: CompleteTaskInput) => apiRequest<{ taskId: string }>("/api/crm/tasks/complete", { method: "POST", body }),
  reopen: (taskId: string) => apiRequest<{ ok: true }>("/api/crm/tasks/reopen", { method: "POST", body: { taskId } }),
};
