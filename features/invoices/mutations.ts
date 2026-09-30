"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { salesKeys } from "@/features/sales";
import type { CreateInvoiceInput } from "@/lib/domain/invoices/schemas";
import { invoicesApi } from "./api";
import { invoiceKeys } from "./queries";

/** Fatura yazımlarından sonra fatura listeleri ve Ödeme Geçmişi'ndeki fatura rozetleri tazelenir. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    void queryClient.invalidateQueries({ queryKey: salesKeys.all });
  };
}

/** POST /api/sales/invoices — fatura talebi (e-posta) / elle kayıt / platform. `key`: Idempotency-Key. */
export function useCreateInvoice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ input, key }: { input: CreateInvoiceInput; key: string }) => invoicesApi.create(input, key),
    onSuccess: invalidate,
  });
}

/** POST /api/sales/invoices/{id}/retry — başarısız faturayı tekrar dene. */
export function useRetryInvoice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => invoicesApi.retry(id),
    onSuccess: invalidate,
  });
}
