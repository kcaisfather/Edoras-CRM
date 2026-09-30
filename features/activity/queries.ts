"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/features/auth";
import { activityApi, type AuditFilters, type EventFilters } from "./api";

export const activityKeys = {
  all: ["activity"] as const,
  events: (f: EventFilters) => [...activityKeys.all, "events", f.institutionId, f.type, f.from, f.to, f.page, f.size] as const,
  institutions: () => [...activityKeys.all, "institutions"] as const,
  audit: (f: AuditFilters) => [...activityKeys.all, "audit", f.actorId, f.action, f.entityType, f.from, f.to, f.page, f.size] as const,
};

/** Kurum etkinliği (Edoras; sunucu her istekte okur). Yalnız ADMIN; süzgeç değişince önceki liste kalır. */
export function useInstitutionEvents(filters: EventFilters, enabled: boolean) {
  const { isAdmin } = usePermissions();
  return useQuery({
    queryKey: activityKeys.events(filters),
    queryFn: ({ signal }) => activityApi.events(filters, signal),
    enabled: isAdmin && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useActivityInstitutions(enabled: boolean) {
  const { isAdmin } = usePermissions();
  return useQuery({
    queryKey: activityKeys.institutions(),
    queryFn: ({ signal }) => activityApi.institutions(signal),
    enabled: isAdmin && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** CRM işlem kaydı (crm_audit_logs). Yalnız ADMIN. */
export function useAuditLogs(filters: AuditFilters, enabled: boolean) {
  const { isAdmin } = usePermissions();
  return useQuery({
    queryKey: activityKeys.audit(filters),
    queryFn: ({ signal }) => activityApi.auditLogs(filters, signal),
    enabled: isAdmin && enabled,
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  });
}
