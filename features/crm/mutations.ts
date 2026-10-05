"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { institutionKeys } from "@/features/institutions";
import { BATCH_MAX, type LeadBatchInput, type LeadBatchResult, type LeadCreateInput, type LeadMergeInput, type LeadPatchInput } from "@/lib/domain/crm/schemas";
import type { PaymentInput } from "@/lib/domain/institutions/schemas";
import type { LeadSaleInput } from "@/lib/domain/crm/sale";
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

/** Satışı kaydeder; hesap açıldıysa / ücretliye geçtiyse kurum listesi de tazelenir. */
export function useRecordSale() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: LeadSaleInput }) => crmApi.recordSale(id, data),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: institutionKeys.all });
    },
  });
}

/** İki adayı birleştirir (yalnız ADMIN): `dropId` silinir, kayıtları `keepId`'ye taşınır. */
export function useMergeLeads() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (input: LeadMergeInput) => crmApi.merge(input),
    onSuccess: () => invalidate(),
  });
}

/** Toplu işlem: seçim 200'lük parçalara bölünüp sırayla gönderilir; sonuçlar toplanır. */
export function useBatchLeads() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: LeadBatchInput["action"] }): Promise<LeadBatchResult> => {
      const total: LeadBatchResult = { done: 0, failed: [] };
      for (let i = 0; i < ids.length; i += BATCH_MAX) {
        const part = await crmApi.batch({ ids: ids.slice(i, i + BATCH_MAX), action });
        total.done += part.done;
        total.failed.push(...part.failed);
      }
      return total;
    },
    onSettled: () => invalidate(),
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
