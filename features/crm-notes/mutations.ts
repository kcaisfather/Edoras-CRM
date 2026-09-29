"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crmNotesApi } from "./api";
import { crmNoteKeys } from "./queries";

/**
 * Not yazımları. Başarıdan sonra adayın not listesi tazelenir; liste rozetlerini (şikâyet, program)
 * etkileyen yazımlarda aday listesini tazelemek çağıranın işidir (features/crm → onSuccess).
 */
function useInvalidateNotes() {
  const queryClient = useQueryClient();
  return (leadId: string) => void queryClient.invalidateQueries({ queryKey: crmNoteKeys.lead(leadId) });
}

export function useCreateCrmNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: ({ leadId, content }: { leadId: string; content: string }) => crmNotesApi.create(leadId, content),
    onSuccess: (_note, { leadId }) => invalidate(leadId),
  });
}

export function useUpdateCrmNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: ({ leadId, noteId, content }: { leadId: string; noteId: string; content: string }) =>
      crmNotesApi.update(leadId, noteId, content),
    onSuccess: (_note, { leadId }) => invalidate(leadId),
  });
}

export function useDeleteCrmNote() {
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: ({ leadId, noteId }: { leadId: string; noteId: string }) => crmNotesApi.remove(leadId, noteId),
    onSuccess: (_r, { leadId }) => invalidate(leadId),
  });
}
