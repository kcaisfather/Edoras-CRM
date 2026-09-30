"use client";

import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/features/auth";
import type { ReportFrequency } from "@/lib/domain/reports/types";
import { reportKeys, reportsApi } from "./api";

/** Abonelikler yalnız ADMIN'e açık (uç da CRM_AGENT'a 403 döner). */
export function useReportSubscriptions() {
  const { isAdmin } = usePermissions();
  return useQuery({ queryKey: reportKeys.subscriptions(), queryFn: ({ signal }) => reportsApi.list(signal), enabled: isAdmin, staleTime: 30 * 1000 });
}

/** Önizleme: sunucuda, çağıranın rolüne göre üretilir; Edoras'a gittiği için 2 dk önbelleğe alınır. */
export function useReportPreview(frequency: ReportFrequency) {
  return useQuery({ queryKey: reportKeys.preview(frequency), queryFn: ({ signal }) => reportsApi.preview(frequency, signal), staleTime: 2 * 60 * 1000, retry: 1 });
}
