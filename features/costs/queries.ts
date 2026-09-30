"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/features/auth";
import { costsApi, type CostEntryFilters } from "./api";

export const costKeys = {
  all: ["costs"] as const,
  overview: () => [...costKeys.all, "overview"] as const,
  services: (month: string) => [...costKeys.all, "services", month] as const,
  entries: (f: CostEntryFilters) => [...costKeys.all, "entries", f.service, f.from, f.to, f.page, f.size] as const,
  budgets: () => [...costKeys.all, "budgets"] as const,
  alerts: () => [...costKeys.all, "alerts"] as const,
  institutions: (month: string) => [...costKeys.all, "institutions", month] as const,
  smsEstimate: (month: string) => [...costKeys.all, "sms-estimate", month] as const,
  settings: () => [...costKeys.all, "settings"] as const,
};

/** Maliyet verisi finansaldır: yalnız ADMIN için istek atılır (uçlar da CRM_AGENT'a 403 döner). */
function useAdminEnabled(enabled = true) {
  const { isAdmin } = usePermissions();
  return isAdmin && enabled;
}

export function useCostOverview() {
  const enabled = useAdminEnabled();
  return useQuery({ queryKey: costKeys.overview(), queryFn: ({ signal }) => costsApi.overview(signal), enabled, staleTime: 60 * 1000 });
}

export function useCostServices(month: string) {
  const enabled = useAdminEnabled();
  return useQuery({ queryKey: costKeys.services(month), queryFn: ({ signal }) => costsApi.services(month, signal), enabled, placeholderData: keepPreviousData, staleTime: 60 * 1000 });
}

export function useCostEntries(filters: CostEntryFilters, enabledFlag = true) {
  const enabled = useAdminEnabled(enabledFlag);
  return useQuery({ queryKey: costKeys.entries(filters), queryFn: ({ signal }) => costsApi.entries(filters, signal), enabled, placeholderData: keepPreviousData, staleTime: 30 * 1000 });
}

export function useCostBudgets() {
  const enabled = useAdminEnabled();
  return useQuery({ queryKey: costKeys.budgets(), queryFn: ({ signal }) => costsApi.budgets(signal), enabled, staleTime: 30 * 1000 });
}

export function useCostAlerts() {
  const enabled = useAdminEnabled();
  return useQuery({ queryKey: costKeys.alerts(), queryFn: ({ signal }) => costsApi.alerts(signal), enabled, staleTime: 30 * 1000 });
}

export function useInstitutionCosts(month: string) {
  const enabled = useAdminEnabled();
  return useQuery({ queryKey: costKeys.institutions(month), queryFn: ({ signal }) => costsApi.institutions(month, signal), enabled, placeholderData: keepPreviousData, staleTime: 2 * 60 * 1000 });
}

/** Edoras sms_logs tahmini — ağır olabilir; sunucu 5 dk önbelleğe alır. */
export function useSmsEstimate(month: string) {
  const enabled = useAdminEnabled(month !== "");
  return useQuery({ queryKey: costKeys.smsEstimate(month), queryFn: ({ signal }) => costsApi.smsEstimate(month, signal), enabled, staleTime: 2 * 60 * 1000 });
}

export function useCostSettings() {
  const enabled = useAdminEnabled();
  return useQuery({ queryKey: costKeys.settings(), queryFn: ({ signal }) => costsApi.settings(signal), enabled, staleTime: 5 * 60 * 1000 });
}
