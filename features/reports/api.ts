/**
 * Rapor istemcisi (Madde 10). Uçlar:
 *   GET/POST /api/reports/subscriptions                → ReportSubscriptionDto[] / ReportSubscriptionDto   (yalnız ADMIN)
 *   PUT/DELETE /api/reports/subscriptions/{id}         → ReportSubscriptionDto / { ok }                    (yalnız ADMIN)
 *   POST /api/reports/subscriptions/{id}/send-now      → { sentTo, failed, sentAt }                        (yalnız ADMIN)
 *   GET /api/reports/preview?sections&frequency        → ReportPreview (çağıranın rolüne göre süzülmüş)
 */
import { apiRequest } from "@/lib/api/client";
import type { ReportSubscriptionInput } from "@/lib/domain/reports/schemas";
import type { ReportFrequency, ReportPreview, ReportSendResult, ReportSubscriptionDto } from "@/lib/domain/reports/types";

export const reportKeys = {
  all: ["reports"] as const,
  subscriptions: () => [...reportKeys.all, "subscriptions"] as const,
  preview: (frequency: ReportFrequency) => [...reportKeys.all, "preview", frequency] as const,
};

/** Formdan gelen girdi (şema çıktısı ile aynı şekil; sunucu yeniden doğrular). */
export type ReportSubscriptionBody = Omit<ReportSubscriptionInput, "weekday" | "dayOfMonth"> & {
  weekday: number | null;
  dayOfMonth: number | null;
};

export const reportsApi = {
  list: (signal?: AbortSignal) => apiRequest<ReportSubscriptionDto[]>("/api/reports/subscriptions", { signal }),
  create: (input: ReportSubscriptionBody) => apiRequest<ReportSubscriptionDto>("/api/reports/subscriptions", { method: "POST", body: input }),
  update: (id: string, input: ReportSubscriptionBody) =>
    apiRequest<ReportSubscriptionDto>(`/api/reports/subscriptions/${encodeURIComponent(id)}`, { method: "PUT", body: input }),
  remove: (id: string) => apiRequest<{ ok: true }>(`/api/reports/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sendNow: (id: string) => apiRequest<ReportSendResult>(`/api/reports/subscriptions/${encodeURIComponent(id)}/send-now`, { method: "POST", body: {} }),
  /** Tüm bölümler; ekran bölüm seçimini istemcide süzer (her seçimde Edoras'a yeniden gidilmesin). */
  preview: (frequency: ReportFrequency, signal?: AbortSignal) => apiRequest<ReportPreview>(`/api/reports/preview?frequency=${frequency}`, { signal }),
};
