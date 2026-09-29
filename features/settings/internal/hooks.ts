"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { institutionKeys } from "@/features/institutions";

/** İç / sunum kurumu işaretle ya da kaldır; kurum listesi ve ayrıntılar tazelenir. */
export function useSetInternal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ institutionId, internal, note }: { institutionId: string; internal: boolean; note?: string }) =>
      internal
        ? apiRequest("/api/settings/internal-institutions", { method: "POST", body: { institutionId, note } })
        : apiRequest(`/api/settings/internal-institutions/${encodeURIComponent(institutionId)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: institutionKeys.all }),
  });
}
