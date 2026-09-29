"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { institutionKeys } from "@/features/institutions";
import type { LeadCreateInput, LeadPatchInput } from "@/lib/domain/crm/schemas";
import type { PaymentInput } from "@/lib/domain/institutions/schemas";
import { crmApi } from "./api";
import { crmKeys } from "./queries";

/** Aday yazımlarından sonra aday listesi, kurum kartı ve tahsilatlar tazelenir. */
export function useInvalidateCrm() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: crmKeys.all });
}

export function useCreateCrmLead() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (input: LeadCreateInput) => crmApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCrmLead() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: LeadPatchInput }) => crmApi.update(id, data),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCrmLead() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (id: string) => crmApi.remove(id),
    onSuccess: () => invalidate(),
  });
}

export function useLinkLead() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ id, institutionId }: { id: string; institutionId: string }) => crmApi.link(id, institutionId),
    onSuccess: () => invalidate(),
  });
}

export function useUnlinkLead() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (id: string) => crmApi.unlink(id),
    onSuccess: () => invalidate(),
  });
}

/** Tahsilat = bağlı kuruma ödeme: aday listesi (tahsilat toplamı) ve kurum ayrıntısı (ödemeler) tazelenir. */
export function useAddCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, input }: { leadId: string; institutionId: string; input: PaymentInput }) =>
      crmApi.addCollection(leadId, input),
    onSuccess: (_r, { institutionId }) => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
      void queryClient.invalidateQueries({ queryKey: institutionKeys.detail(institutionId) });
    },
  });
}
