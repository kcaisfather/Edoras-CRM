import { apiRequest } from "@/lib/api/client";
import type { GrowthCustomersResponse, UsageSignals, WeeklyActivityResponse } from "@/lib/domain/growth/types";

export const growthApi = {
  customers: (windowDays: number, signal?: AbortSignal) =>
    apiRequest<GrowthCustomersResponse>(`/api/growth/customers?window=${windowDays}`, { signal }),
  weekly: (weeks: number, signal?: AbortSignal) => apiRequest<WeeklyActivityResponse>(`/api/growth/weekly?weeks=${weeks}`, { signal }),
  institutionUsage: (id: string, windowDays: number, signal?: AbortSignal) =>
    apiRequest<UsageSignals | null>(`/api/growth/institutions/${encodeURIComponent(id)}/usage?window=${windowDays}`, { signal }),
};
