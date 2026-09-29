"use client";

import { useQuery } from "@tanstack/react-query";
import { crmNotesApi } from "./api";

export const crmNoteKeys = {
  all: ["crmNotes"] as const,
  lead: (leadId: string) => [...crmNoteKeys.all, "lead", leadId] as const,
};

/** Adayın notları (yeniden eskiye). */
export function useLeadNotes(leadId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: crmNoteKeys.lead(leadId ?? ""),
    queryFn: ({ signal }) => crmNotesApi.list(leadId as string, signal),
    enabled: enabled && !!leadId,
    staleTime: 60 * 1000,
  });
}
