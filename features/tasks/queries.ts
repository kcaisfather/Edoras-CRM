"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { crmKeys, useAllCrmLeads } from "@/features/crm";
import { usePermissions } from "@/features/auth";
import { addDays, todayIso } from "@/lib/domain/institutions/rules";
import { UPCOMING_WINDOW_DAYS } from "@/lib/domain/tasks/derive";
import { attachTaskSubjects } from "@/lib/domain/tasks/view";
import { tasksApi } from "./api";

/**
 * Görev sorgu anahtarları crmKeys altında: aday yazımları (crmKeys.all'u geçersiz kılar) görevleri ve rozeti de
 * tazeler — statü, arama tarihi ya da satış tutarı değişince görevler yeniden türetilir.
 */
export const taskKeys = {
  all: [...crmKeys.all, "tasks"] as const,
  list: (to: string) => [...taskKeys.all, "list", to] as const,
  dueCount: () => [...taskKeys.all, "dueCount"] as const,
  assignees: () => [...taskKeys.all, "assignees"] as const,
};

/**
 * "Görevlerim" veri kaynağı: sunucuda türetilen + saklı görevler (açık ve son 90 günde tamamlananlar; vade ≤ bugün
 * + 14) ve bunların adayı / kurumu (paylaşılan aday ve kurum önbelleğinden). DeepSport'taki tarayıcı türetmesi,
 * not taraması ve localStorage tamamlanma deposu yok.
 */
export function useCrmTaskList() {
  const leadsQ = useAllCrmLeads();
  const today = useMemo(() => todayIso(), []);
  const to = addDays(today, UPCOMING_WINDOW_DAYS);
  const query = useQuery({
    queryKey: taskKeys.list(to),
    queryFn: ({ signal }) => tasksApi.list({ to }, signal),
    staleTime: 30 * 1000,
  });
  const tasks = useMemo(
    () => attachTaskSubjects(query.data ?? [], leadsQ.leads, leadsQ.institutions, today),
    [query.data, leadsQ.leads, leadsQ.institutions, today]
  );
  return {
    tasks,
    today,
    isLoading: query.isLoading || leadsQ.isLoading || leadsQ.institutionsLoading,
    isError: query.isError || leadsQ.isError,
    /** Kurum listesi (Edoras) okunamadı: adayı olmayan kurum görevleri gösterilemez; ekran uyarır. */
    institutionsError: leadsQ.institutionsError,
    refetchInstitutions: leadsQ.refetchInstitutions,
    refetch: () => {
      leadsQ.refetch();
      void query.refetch();
    },
  };
}

/**
 * Menü rozeti: çağıranın gördüğü gecikmiş + bugün açık görev sayısı (sunucu sayar; aday listesi yüklenmez).
 * /crm/tasks'a erişemeyen kullanıcıda istek atılmaz ve 0 döner.
 */
export function useDueTaskCount(): number {
  const { canAccessPath, isLoading } = usePermissions();
  const enabled = !isLoading && canAccessPath("/crm/tasks");
  const query = useQuery({
    queryKey: taskKeys.dueCount(),
    queryFn: ({ signal }) => tasksApi.dueCount(signal),
    enabled,
    staleTime: 60 * 1000,
  });
  return enabled ? (query.data?.count ?? 0) : 0;
}

/** "Atanan kişi" seçenekleri (ADMIN: aktif ekip; CRM_AGENT: yalnız kendisi). Yalnız diyalog açıkken istenir. */
export function useAssignees(enabled = true) {
  return useQuery({
    queryKey: taskKeys.assignees(),
    queryFn: ({ signal }) => tasksApi.assignees(signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
