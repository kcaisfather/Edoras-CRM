"use client";

import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/features/auth";
import { teamApi, teamKeys } from "./api";

/** Ekip listesi (yalnız yönetici; CRM_AGENT için istek atılmaz). */
export function useStaff() {
  const { isAdmin } = usePermissions();
  return useQuery({
    queryKey: teamKeys.list(),
    queryFn: ({ signal }) => teamApi.list(signal),
    enabled: isAdmin,
    staleTime: 60 * 1000,
  });
}
