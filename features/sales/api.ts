import { apiRequest } from "@/lib/api/client";
import type { SalePaymentFilters, SalePaymentList } from "@/lib/domain/invoices/types";

const qs = (params: Record<string, string | number | null | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/**
 * Satış uçları (DeepSport /log-products "Ödeme Geçmişi" karşılığı; yalnız ADMIN):
 *   GET /api/sales/payments?from&to&method&institutionId&query&page&size → SalePaymentList (toplam dahil)
 */
export const salesApi = {
  payments: (filters: SalePaymentFilters, signal?: AbortSignal) =>
    apiRequest<SalePaymentList>(
      `/api/sales/payments${qs({
        from: filters.from,
        to: filters.to,
        method: filters.method,
        institutionId: filters.institutionId,
        query: filters.query,
        page: filters.page,
        size: filters.size,
      })}`,
      { signal }
    ),
};
