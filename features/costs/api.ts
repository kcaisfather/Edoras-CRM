import { ApiError, apiRequest } from "@/lib/api/client";
import { isApiErrorCode } from "@/lib/api/error-codes";
import type { CostBudgetInput, CostEntryInput } from "@/lib/domain/costs/schemas";
import type {
  BudgetStatus,
  CostAlert,
  CostBudget,
  CostEntry,
  CostEntryList,
  CostOverview,
  CostService,
  CostSettings,
  InstitutionCostsResponse,
  ServicesMatrix,
  SmsEstimate,
} from "@/lib/domain/costs/types";

export interface CostEntryFilters {
  service: CostService | "";
  from: string;
  to: string;
  page: number;
  size: number;
}

export interface CostImportResult {
  created: number;
  invalid: number[];
  duplicates: number[];
}

export const COST_EXPORT_KINDS = ["entries", "services", "trend", "institutions"] as const;
export type CostExportKind = (typeof COST_EXPORT_KINDS)[number];

const qs = (params: Record<string, string | number | null | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/**
 * Maliyet uçları (hepsi yalnız ADMIN). Veri CRM'in kendi maliyet defteridir (DeepSport'taki AWS maliyet servisi yok).
 *   GET  /api/costs/overview            → CostOverview
 *   GET  /api/costs/services?month      → ServicesMatrix (ay ile biten 12 ay)
 *   GET/POST /api/costs/entries         → CostEntryList / CostEntry;  PUT/DELETE /api/costs/entries/{id};  POST /api/costs/entries/import
 *   GET/POST /api/costs/budgets         → { month, items: { budget, status }[] } / CostBudget;  PUT/DELETE /api/costs/budgets/{id}
 *   GET  /api/costs/alerts              → { month, items: CostAlert[] } (okuma anında hesaplanır)
 *   GET  /api/costs/institutions?month  → InstitutionCostsResponse
 *   GET  /api/costs/sms-estimate?month  → SmsEstimate (Edoras sms_logs, salt okunur)
 *   GET/PUT /api/costs/settings         → CostSettings (SMS birim fiyatı)
 *   GET  /api/costs/export?kind&month   → CSV
 */
export const costsApi = {
  overview: (signal?: AbortSignal) => apiRequest<CostOverview>("/api/costs/overview", { signal }),
  services: (month: string, signal?: AbortSignal) => apiRequest<ServicesMatrix>(`/api/costs/services${qs({ month })}`, { signal }),
  entries: (f: CostEntryFilters, signal?: AbortSignal) =>
    apiRequest<CostEntryList>(`/api/costs/entries${qs({ service: f.service, from: f.from, to: f.to, page: f.page, size: f.size })}`, { signal }),
  createEntry: (input: CostEntryInput) => apiRequest<CostEntry>("/api/costs/entries", { method: "POST", body: input }),
  updateEntry: (id: string, input: CostEntryInput) => apiRequest<CostEntry>(`/api/costs/entries/${encodeURIComponent(id)}`, { method: "PUT", body: input }),
  deleteEntry: (id: string) => apiRequest<{ ok: true }>(`/api/costs/entries/${encodeURIComponent(id)}`, { method: "DELETE" }),
  importEntries: (rows: CostEntryInput[]) => apiRequest<CostImportResult>("/api/costs/entries/import", { method: "POST", body: { rows } }),
  budgets: (signal?: AbortSignal) => apiRequest<{ month: string; items: { budget: CostBudget; status: BudgetStatus }[] }>("/api/costs/budgets", { signal }),
  createBudget: (input: CostBudgetInput) => apiRequest<CostBudget>("/api/costs/budgets", { method: "POST", body: input }),
  updateBudget: (id: string, input: CostBudgetInput) => apiRequest<CostBudget>(`/api/costs/budgets/${encodeURIComponent(id)}`, { method: "PUT", body: input }),
  deleteBudget: (id: string) => apiRequest<{ ok: true }>(`/api/costs/budgets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  alerts: (signal?: AbortSignal) => apiRequest<{ month: string; items: CostAlert[] }>("/api/costs/alerts", { signal }),
  institutions: (month: string, signal?: AbortSignal) => apiRequest<InstitutionCostsResponse>(`/api/costs/institutions${qs({ month })}`, { signal }),
  smsEstimate: (month: string, signal?: AbortSignal) => apiRequest<SmsEstimate>(`/api/costs/sms-estimate${qs({ month })}`, { signal }),
  settings: (signal?: AbortSignal) => apiRequest<CostSettings>("/api/costs/settings", { signal }),
  updateSettings: (input: { smsUnitPriceTry: number }) => apiRequest<CostSettings>("/api/costs/settings", { method: "PUT", body: input }),
  /** CSV dosyası (Blob). Hata gövdesi { error: { code } } ise ApiError olarak atılır. */
  exportCsv: async (kind: CostExportKind, month: string): Promise<Blob> => {
    const res = await fetch(`/api/costs/export${qs({ kind, month })}`, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
      throw new ApiError("Export failed", res.status, isApiErrorCode(code) ? code : null);
    }
    return res.blob();
  },
};
