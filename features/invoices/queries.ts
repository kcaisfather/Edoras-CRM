"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/features/auth";
import type { InvoiceListFilters } from "@/lib/domain/invoices/types";
import { invoicesApi } from "./api";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (f: InvoiceListFilters) =>
    [...invoiceKeys.all, "list", f.status ?? "", f.institutionId ?? "", f.from ?? "", f.to ?? "", f.saleRef ?? "", f.page ?? 0, f.size ?? 20] as const,
  options: () => [...invoiceKeys.all, "options"] as const,
};

/** Sağlayıcılar ve e-posta yöntemi açık mı (sunucu ayarı; nadiren değişir). */
export function useInvoiceOptions(enabled = true) {
  const { canSeeFinancials } = usePermissions();
  return useQuery({
    queryKey: invoiceKeys.options(),
    queryFn: ({ signal }) => invoicesApi.options(signal),
    staleTime: 10 * 60 * 1000,
    enabled: enabled && canSeeFinancials,
  });
}

/** Fatura listesi (sunucu tarafı süzgeç + sayfalama). Finansal yetkisi olmayan rolde istek atılmaz. */
export function useInvoices(filters: InvoiceListFilters, enabled = true) {
  const { canSeeFinancials } = usePermissions();
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: ({ signal }) => invoicesApi.list(filters, signal),
    enabled: enabled && canSeeFinancials,
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  });
}

/** Bir kurumun faturaları (kurum ödeme listesindeki rozetler; en çok 200). */
export function useInstitutionInvoices(institutionId: string, enabled = true) {
  return useInvoices({ institutionId, size: 200 }, enabled);
}

/** Aynı satışın faturaları (çift fatura uyarısı). `saleRef`: "payment:<id>" / "license:<id>". */
export function useInvoicesForSale(saleRef: string | null, enabled = true) {
  return useInvoices({ saleRef: saleRef ?? undefined, size: 50 }, enabled && !!saleRef);
}
