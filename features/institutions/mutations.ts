"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BillingInput,
  ContactInput,
  ConvertInput,
  EnrollInput,
  LicenseEditInput,
  LicenseListPriceInput,
  NewDemoInput,
  PaymentInput,
  RenewInput,
} from "@/lib/domain/institutions/schemas";
import type { PanelModuleToggleInput } from "@/lib/domain/institutions/panel-modules";
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
 * Lisans bedeli / ödeme düzeltmesi CRM'deki satış · tahsilat · açık bakiyeyi (aday satış tutarı tetikleyiciyle
 * düzelir) ve Ödeme Geçmişi'ni de değiştirir. Kök anahtarlar elle yazıldı: features/crm bu modülü içe aktarır,
 * oradan almak döngü kurar (crmKeys.all = ["crm"], salesKeys.all = ["sales"]).
 */
function useInvalidateSales() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  return (id: string) => {
    invalidate(id);
    void queryClient.invalidateQueries({ queryKey: ["crm"] });
    void queryClient.invalidateQueries({ queryKey: ["sales"] });
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

export function useUpdateLicense(id: string) {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: ({ licenseId, input }: { licenseId: string; input: LicenseEditInput }) => institutionsApi.updateLicense(id, licenseId, input),
    onSuccess: () => invalidate(id),
  });
}

export function useUpdatePayment(id: string) {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: ({ paymentId, input }: { paymentId: string; input: PaymentInput }) => institutionsApi.updatePayment(id, paymentId, input),
    onSuccess: () => invalidate(id),
  });
}

export function useDeletePayment(id: string) {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: (paymentId: string) => institutionsApi.deletePayment(id, paymentId),
    onSuccess: () => invalidate(id),
  });
}

export function useUpdateLicensePricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LicenseListPriceInput) => institutionsApi.updateLicensePricing(input),
    onSuccess: (data) => queryClient.setQueryData(institutionKeys.licensePricing(), data),
  });
}

/** Panel modülünü aç / kapat (yalnız ADMIN). Sunucu güncel listeyi döndürür → önbelleğe doğrudan yazılır. */
export function useSetPanelModule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PanelModuleToggleInput) => institutionsApi.setPanelModule(id, input),
    onSuccess: (modules) => queryClient.setQueryData(institutionKeys.panelModules(id), modules),
  });
}
