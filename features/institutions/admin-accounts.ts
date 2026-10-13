"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type {
  AdminActiveChangeResult,
  AdminActiveInput,
  AdminEmailChangeResult,
  AdminEmailInput,
  AdminPasswordReset,
  AdminPasswordResetInput,
} from "@/lib/domain/institutions/edoras-accounts";
import { institutionKeys } from "./queries";

/**
 * Edoras kurum yöneticisi hesap işlemleri (yalnız ADMIN): giriş e-postası, şifre sıfırlama, aktif / pasif. Ayrı dosya:
 * kurumlar modülünün api.ts / mutations.ts'ine dokunmadan eklendi. Yalnız istemci bileşenleri içe aktarır.
 */
const adminBase = (institutionId: string, userId: string) =>
  `/api/institutions/${encodeURIComponent(institutionId)}/admins/${encodeURIComponent(userId)}`;

export const adminAccountsApi = {
  changeEmail: (institutionId: string, userId: string, input: AdminEmailInput) =>
    apiRequest<AdminEmailChangeResult>(adminBase(institutionId, userId), { method: "PATCH", body: input }),
  resetPassword: (institutionId: string, userId: string, input: AdminPasswordResetInput) =>
    apiRequest<AdminPasswordReset>(`${adminBase(institutionId, userId)}/password`, { method: "POST", body: input }),
  setActive: (institutionId: string, userId: string, input: AdminActiveInput) =>
    apiRequest<AdminActiveChangeResult>(`${adminBase(institutionId, userId)}/active`, { method: "PATCH", body: input }),
};

/** Yönetici listesi kurum ayrıntısından gelir: ayrıntı (ve liste) tazelenir. */
function useInvalidateInstitution(institutionId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: institutionKeys.detail(institutionId) });
    void queryClient.invalidateQueries({ queryKey: institutionKeys.list() });
  };
}

export function useChangeAdminEmail(institutionId: string) {
  const invalidate = useInvalidateInstitution(institutionId);
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: AdminEmailInput }) =>
      adminAccountsApi.changeEmail(institutionId, userId, input),
    onSuccess: invalidate,
  });
}

export function useResetAdminPassword(institutionId: string) {
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: AdminPasswordResetInput }) =>
      adminAccountsApi.resetPassword(institutionId, userId, input),
  });
}

export function useSetAdminActive(institutionId: string) {
  const invalidate = useInvalidateInstitution(institutionId);
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: AdminActiveInput }) =>
      adminAccountsApi.setActive(institutionId, userId, input),
    onSuccess: invalidate,
  });
}
