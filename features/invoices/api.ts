import { apiRequest } from "@/lib/api/client";
import type { CreateInvoiceInput } from "@/lib/domain/invoices/schemas";
import type { Invoice, InvoiceList, InvoiceListFilters, InvoiceOptions } from "@/lib/domain/invoices/types";

const qs = (params: Record<string, string | number | null | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/**
 * Fatura uçları (DeepSport features/invoices/api.ts sözleşmesinin Next route handler karşılığı; INVOICES bayrağının açık yolu).
 * Hepsi yalnız ADMIN (CRM_AGENT 403):
 *   GET  /api/sales/invoices/options                          → { providers, emailAvailable }
 *   GET  /api/sales/invoices?status&institutionId&from&to&saleRef&page&size → InvoiceList
 *   POST /api/sales/invoices  (+ Idempotency-Key)             → Invoice (201; aynı anahtar → 200)
 *   POST /api/sales/invoices/{id}/retry                       → Invoice (yalnız FAILED)
 * Fatura bilgisi (GET/PUT /api/institutions/{id}/billing) kurumlar modülündedir.
 */
export const invoicesApi = {
  options: (signal?: AbortSignal) => apiRequest<InvoiceOptions>("/api/sales/invoices/options", { signal }),
  list: (filters: InvoiceListFilters, signal?: AbortSignal) =>
    apiRequest<InvoiceList>(
      `/api/sales/invoices${qs({
        status: filters.status,
        institutionId: filters.institutionId,
        from: filters.from,
        to: filters.to,
        saleRef: filters.saleRef,
        page: filters.page,
        size: filters.size,
      })}`,
      { signal }
    ),
  create: (input: CreateInvoiceInput, idempotencyKey: string) =>
    apiRequest<Invoice>("/api/sales/invoices", { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey } }),
  retry: (id: string) => apiRequest<Invoice>(`/api/sales/invoices/${encodeURIComponent(id)}/retry`, { method: "POST" }),
};
