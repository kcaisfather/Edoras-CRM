"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInstitutions } from "@/features/institutions";
import { usePermissions } from "@/features/auth";
import type { CrmLead, CrmLeadDto } from "@/lib/domain/crm/types";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import { crmApi } from "./api";

export const crmKeys = {
  all: ["crm"] as const,
  leads: () => [...crmKeys.all, "leads"] as const,
  forInstitution: (institutionId: string) => [...crmKeys.all, "institution", institutionId] as const,
  collections: (leadId: string) => [...crmKeys.all, "collections", leadId] as const,
};

/**
 * Aday satırına bağlı kurumu ekler. Kurum listesi henüz gelmediyse `institution` undefined kalır
 * ("bilinmiyor"); kurum Edoras'ta ve CRM'de yoksa null.
 */
export function attachInstitutions(dtos: CrmLeadDto[], institutions: InstitutionListItem[] | undefined): CrmLead[] {
  const byId = new Map((institutions ?? []).map((i) => [i.id, i]));
  return dtos.map((dto) => ({
    ...dto,
    institution: dto.institutionId ? (institutions ? (byId.get(dto.institutionId) ?? null) : undefined) : null,
  }));
}

/**
 * Tüm adaylar (DeepSport G08: ekran istemcide süzer) + bağlı kurum özeti. Kurum listesi zaten önbellekte
 * (menü rozeti de onu kullanır). Yazımlar crmKeys.all'u geçersiz kıldığı için tazelenir.
 */
export function useAllCrmLeads(enabled = true) {
  const query = useQuery({
    queryKey: crmKeys.leads(),
    queryFn: ({ signal }) => crmApi.list(signal),
    enabled,
    staleTime: 30 * 1000,
  });
  const institutions = useInstitutions();
  const leads = useMemo(() => attachInstitutions(query.data ?? [], institutions.data), [query.data, institutions.data]);
  return {
    leads,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    institutions: institutions.data,
    institutionsLoading: institutions.isLoading,
    institutionsError: institutions.isError,
    refetchInstitutions: () => void institutions.refetch(),
  };
}

/** Kuruma bağlı aday (kurum ayrıntısı kartı): yoksa null. */
export function useLeadForInstitution(institutionId: string) {
  return useQuery({
    queryKey: crmKeys.forInstitution(institutionId),
    queryFn: async ({ signal }) => (await crmApi.forInstitution(institutionId, signal))[0] ?? null,
    enabled: !!institutionId,
  });
}

/** Adayın tahsilat geçmişi (bağlı kurumun ödemeleri) — yalnız finans yetkisiyle istenir. */
export function useLeadCollections(lead: Pick<CrmLead, "id" | "institutionId"> | null | undefined, enabled = true) {
  const { canSeeFinancials } = usePermissions();
  return useQuery({
    queryKey: crmKeys.collections(lead?.id ?? ""),
    queryFn: ({ signal }) => crmApi.collections(lead!.id, signal),
    enabled: enabled && canSeeFinancials && !!lead?.institutionId,
    staleTime: 60 * 1000,
  });
}
