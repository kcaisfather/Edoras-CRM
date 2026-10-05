import { apiRequest } from "@/lib/api/client";
import type { PerformanceResult } from "@/lib/server/performance";

/** GET /api/crm/performance — tipi yalnız şekil için; sunucu modülü istemciye girmez (type import). */
export type { PerformanceResult };

export const performanceApi = {
  get: (from: string, to: string, signal?: AbortSignal) =>
    apiRequest<PerformanceResult>(`/api/crm/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal }),
};
