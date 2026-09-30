"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/features/auth";
import type { SalePaymentFilters } from "@/lib/domain/invoices/types";
import { salesApi } from "./api";

export const salesKeys = {
  all: ["sales"] as const,
  payments: (f: SalePaymentFilters) =>
    [...salesKeys.all, "payments", f.from ?? "", f.to ?? "", f.method ?? "", f.institutionId ?? "", f.query ?? "", f.page ?? 0, f.size ?? 20] as const,
};

/** Ödeme Geçmişi (sunucu tarafı süzgeç + sayfalama). Finansal yetkisi olmayan rolde istek atılmaz. */
export function useSalePayments(filters: SalePaymentFilters) {
  const { canSeeFinancials } = usePermissions();
  return useQuery({
    queryKey: salesKeys.payments(filters),
    queryFn: ({ signal }) => salesApi.payments(filters, signal),
    enabled: canSeeFinancials,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}
