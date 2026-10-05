"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { institutionStatus } from "@/lib/domain/institutions/status";
import { todayIso } from "@/lib/domain/institutions/rules";
import { institutionsApi } from "./api";

export const institutionKeys = {
  all: ["institutions"] as const,
  list: () => [...institutionKeys.all, "list"] as const,
  detail: (id: string) => [...institutionKeys.all, "detail", id] as const,
  licensePricing: () => [...institutionKeys.all, "license-pricing"] as const,
};

export function useInstitutions() {
  return useQuery({
    queryKey: institutionKeys.list(),
    queryFn: ({ signal }) => institutionsApi.list(signal),
  });
}

export function useInstitution(id: string) {
  return useQuery({
    queryKey: institutionKeys.detail(id),
    queryFn: ({ signal }) => institutionsApi.get(id, signal),
    enabled: !!id,
  });
}

/** Lisans liste fiyatı (Ayarlar). Yalnız ADMIN çağırır; satış formları indirim önizlemesi için kullanır. */
export function useLicensePricing(enabled = true) {
  return useQuery({
    queryKey: institutionKeys.licensePricing(),
    queryFn: ({ signal }) => institutionsApi.licensePricing(signal),
    enabled,
    staleTime: 60_000,
  });
}

/** Aksiyon bekleyen kurum sayısı (menü rozeti): süresi dolmuş demo + bitmiş lisans. */
export function useInstitutionAlerts(): number {
  const { data } = useInstitutions();
  return useMemo(() => {
    const today = todayIso();
    return (data ?? []).filter((item) => {
      const { state } = institutionStatus(item, today);
      return state === "DEMO_BITTI" || state === "LISANS_BITTI";
    }).length;
  }, [data]);
}
