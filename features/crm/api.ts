import { apiRequest } from "@/lib/api/client";
import type { CollectionRecord } from "@/lib/domain/crm/collections";
import type { LeadCreateInput, LeadPatchInput } from "@/lib/domain/crm/schemas";
import type { CrmLeadDto } from "@/lib/domain/crm/types";
import type { NewDemoInput, PaymentInput } from "@/lib/domain/institutions/schemas";
import type { DemoCredentials } from "@/lib/domain/institutions/types";

const base = (id: string) => `/api/crm/leads/${encodeURIComponent(id)}`;

export const crmApi = {
  list: (signal?: AbortSignal) => apiRequest<CrmLeadDto[]>("/api/crm/leads", { signal }),
  forInstitution: (institutionId: string, signal?: AbortSignal) =>
    apiRequest<CrmLeadDto[]>(`/api/crm/leads?institutionId=${encodeURIComponent(institutionId)}`, { signal }),
  create: (input: LeadCreateInput) => apiRequest<CrmLeadDto>("/api/crm/leads", { method: "POST", body: input }),
  update: (id: string, input: LeadPatchInput) => apiRequest<CrmLeadDto>(base(id), { method: "PATCH", body: input }),
  remove: (id: string) => apiRequest<{ ok: true }>(base(id), { method: "DELETE" }),
  link: (id: string, institutionId: string) =>
    apiRequest<CrmLeadDto>(`${base(id)}/link`, { method: "POST", body: { institutionId } }),
  unlink: (id: string) => apiRequest<CrmLeadDto>(`${base(id)}/link`, { method: "DELETE" }),
  openDemo: (id: string, input: NewDemoInput) =>
    apiRequest<DemoCredentials>(`${base(id)}/demo`, { method: "POST", body: input }),
  collections: (id: string, signal?: AbortSignal) => apiRequest<CollectionRecord[]>(`${base(id)}/collections`, { signal }),
  addCollection: (id: string, input: PaymentInput) =>
    apiRequest<{ ok: true }>(`${base(id)}/collections`, { method: "POST", body: input }),
};
