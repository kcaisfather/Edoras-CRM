import { apiRequest } from "@/lib/api/client";
import type { CommitmentInput, RenewalCommitmentDto } from "@/lib/domain/growth/commitments";
import type { GrowthCustomersResponse, UsageSignals, WeeklyActivityResponse } from "@/lib/domain/growth/types";

export const growthApi = {
  customers: (windowDays: number, signal?: AbortSignal) =>
    apiRequest<GrowthCustomersResponse>(`/api/growth/customers?window=${windowDays}`, { signal }),
  weekly: (weeks: number, signal?: AbortSignal) => apiRequest<WeeklyActivityResponse>(`/api/growth/weekly?weeks=${weeks}`, { signal }),
  commitments: (signal?: AbortSignal) => apiRequest<RenewalCommitmentDto[]>("/api/crm/renewals/commitments", { signal }),
  setCommitment: (institutionId: string, input: CommitmentInput) =>
    apiRequest<RenewalCommitmentDto>(`/api/crm/renewals/commitments/${encodeURIComponent(institutionId)}`, { method: "PUT", body: input }),
  clearCommitment: (institutionId: string) =>
    apiRequest<{ ok: true }>(`/api/crm/renewals/commitments/${encodeURIComponent(institutionId)}`, { method: "DELETE" }),
  institutionUsage: (id: string, windowDays: number, signal?: AbortSignal) =>
    apiRequest<UsageSignals | null>(`/api/growth/institutions/${encodeURIComponent(id)}/usage?window=${windowDays}`, { signal }),
};
