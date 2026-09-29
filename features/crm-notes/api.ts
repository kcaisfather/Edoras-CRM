import { apiRequest } from "@/lib/api/client";
import type { CrmNote } from "@/lib/domain/crm-notes/types";

const base = (leadId: string) => `/api/crm/leads/${encodeURIComponent(leadId)}/notes`;
const one = (leadId: string, noteId: string) => `${base(leadId)}/${encodeURIComponent(noteId)}`;

/** Aday notları. Yazar sunucuda oturumdan yazılır; gövdede yalnız metin gider. */
export const crmNotesApi = {
  list: (leadId: string, signal?: AbortSignal) => apiRequest<CrmNote[]>(base(leadId), { signal }),
  create: (leadId: string, content: string) => apiRequest<CrmNote>(base(leadId), { method: "POST", body: { content } }),
  update: (leadId: string, noteId: string, content: string) =>
    apiRequest<CrmNote>(one(leadId, noteId), { method: "PATCH", body: { content } }),
  remove: (leadId: string, noteId: string) => apiRequest<{ ok: true }>(one(leadId, noteId), { method: "DELETE" }),
};
