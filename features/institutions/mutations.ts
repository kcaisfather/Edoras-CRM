"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BillingInput,
  ContactInput,
  ConvertInput,
  EnrollInput,
  NewDemoInput,
  PaymentInput,
  RenewInput,
} from "@/lib/domain/institutions/schemas";
import type { DemoCredentials } from "@/lib/domain/institutions/types";
import { institutionsApi } from "./api";
import { institutionKeys } from "./queries";

/** Kurum yazımlarından sonra liste ve (varsa) ayrıntı tazelenir. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: institutionKeys.list() });
    if (id) void queryClient.invalidateQueries({ queryKey: institutionKeys.detail(id) });
  };
}

/**
 * Yeni demo. `submit` verilirse istek onunla atılır (ör. CRM adayından demo: POST /api/crm/leads/[id]/demo —
 * aynı form, aday bağlantısı sunucuda aynı geri alma zincirinde).
 */
export function useCreateDemo(submit?: (input: NewDemoInput) => Promise<DemoCredentials>) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: NewDemoInput) => (submit ?? institutionsApi.createDemo)(input),
    onSuccess: () => invalidate(),
  });
}

export function useEnrollInstitution(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: EnrollInput) => institutionsApi.enroll(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useConvertToPaid(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ConvertInput) => institutionsApi.convert(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useRenewLicense(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RenewInput) => institutionsApi.renew(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useUpdateContact(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ContactInput) => institutionsApi.updateContact(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useUpdateBilling(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: BillingInput) => institutionsApi.updateBilling(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useRecordPayment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: PaymentInput) => institutionsApi.recordPayment(id, input),
    onSuccess: () => invalidate(id),
  });
}
