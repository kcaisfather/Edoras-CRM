import { apiRequest } from "@/lib/api/client";
import type { BulkImportResult, ImportItem } from "@/lib/import/bulk";
import type { ProspectConvertInput, ProspectListCreateInput, ProspectPatchInput } from "@/lib/domain/cold-lists/schemas";
import type { Prospect, ProspectList, ProspectsPage } from "@/lib/domain/cold-lists/types";

const prospectBase = (id: string) => `/api/crm/prospects/${encodeURIComponent(id)}`;
const listBase = (id: string) => `/api/crm/prospect-lists/${encodeURIComponent(id)}`;

/**
 * Soğuk liste ve içe aktarma uçları (DeepSport features/cold-lists/api.ts sözleşmesinin Next route handler karşılığı;
 * BACKEND_FEATURES.PROSPECTS'in açık yolu — localStorage deposu yok):
 *   GET    /api/crm/prospect-lists                               → ProspectList[]
 *   POST   /api/crm/prospect-lists            { name, sourceFile } → ProspectList
 *   DELETE /api/crm/prospect-lists/{id}                           (yalnız ADMIN; kişileriyle birlikte)
 *   GET    /api/crm/prospects?listId&page&size                    → { items, page, size, total }
 *   POST   /api/crm/prospect-lists/{id}/prospects/bulk { items }  → { created, skipped, dryRun }
 *   PATCH  /api/crm/prospects/{id}            ProspectPatch       → Prospect
 *   DELETE /api/crm/prospects/{id}
 *   POST   /api/crm/prospects/{id}/convert    { status, addNote } → { crmLeadId, prospect }
 *   POST   /api/crm/leads/bulk                { items, dryRun }   → { created, skipped, dryRun }
 */
export const coldListsApi = {
  lists: (signal?: AbortSignal) => apiRequest<ProspectList[]>("/api/crm/prospect-lists", { signal }),
  createList: (body: ProspectListCreateInput) => apiRequest<ProspectList>("/api/crm/prospect-lists", { method: "POST", body }),
  deleteList: (id: string) => apiRequest<{ ok: true }>(listBase(id), { method: "DELETE" }),
  prospectsPage: (listId: string, page: number, size: number, signal?: AbortSignal) =>
    apiRequest<ProspectsPage>(`/api/crm/prospects?listId=${encodeURIComponent(listId)}&page=${page}&size=${size}`, { signal }),
  bulkAdd: (listId: string, items: ImportItem[]) =>
    apiRequest<BulkImportResult>(`${listBase(listId)}/prospects/bulk`, { method: "POST", body: { items } }),
  patch: (id: string, body: ProspectPatchInput) => apiRequest<Prospect>(prospectBase(id), { method: "PATCH", body }),
  remove: (id: string) => apiRequest<{ ok: true }>(prospectBase(id), { method: "DELETE" }),
  convert: (id: string, body: ProspectConvertInput) =>
    apiRequest<{ crmLeadId: string; prospect: Prospect }>(`${prospectBase(id)}/convert`, { method: "POST", body }),
  importLeads: (items: ImportItem[], dryRun: boolean) =>
    apiRequest<BulkImportResult>("/api/crm/leads/bulk", { method: "POST", body: { items, dryRun } }),
};
