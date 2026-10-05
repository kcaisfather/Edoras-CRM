"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TicketCreateInput, TicketDetailDto, TicketPatchInput } from "@/lib/domain/tickets/types";
import { ticketsApi } from "./api";
import { ticketKeys } from "./queries";

/** Yazımlar güncel talebi önbelleğe koyar ve listeleri tazeler. */
function useRefreshing() {
  const qc = useQueryClient();
  return (ticket: TicketDetailDto) => {
    qc.setQueryData(ticketKeys.detail(ticket.id), ticket);
    void qc.invalidateQueries({ queryKey: [...ticketKeys.all, "list"] });
  };
}

export function useCreateTicket() {
  const refresh = useRefreshing();
  return useMutation({ mutationFn: (body: TicketCreateInput) => ticketsApi.create(body), onSuccess: refresh });
}

export function usePatchTicket(id: string) {
  const refresh = useRefreshing();
  return useMutation({ mutationFn: (body: TicketPatchInput) => ticketsApi.patch(id, body), onSuccess: refresh });
}

export function useAddTicketNote(id: string) {
  const refresh = useRefreshing();
  return useMutation({ mutationFn: (body: string) => ticketsApi.addNote(id, body), onSuccess: refresh });
}

/** Destek bağlantısı: `rotate` true ise eski bağlantı geçersiz olur. */
export function useTicketLink(institutionId: string) {
  return useMutation({ mutationFn: (rotate: boolean) => ticketsApi.link(institutionId, rotate) });
}
