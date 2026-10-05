"use client";

import { useQuery } from "@tanstack/react-query";
import type { TicketStatus } from "@/lib/domain/tickets/types";
import { ticketsApi } from "./api";

export const ticketKeys = {
  all: ["tickets"] as const,
  list: (institutionId: string | null, status: TicketStatus | null) => [...ticketKeys.all, "list", institutionId, status] as const,
  detail: (id: string) => [...ticketKeys.all, "detail", id] as const,
};

/** Talep listesi; `institutionId` verilirse yalnız o kurumun talepleri. */
export function useTickets(params: { institutionId?: string; status?: TicketStatus } = {}) {
  return useQuery({
    queryKey: ticketKeys.list(params.institutionId ?? null, params.status ?? null),
    queryFn: ({ signal }) => ticketsApi.list(params, signal),
    staleTime: 30 * 1000,
  });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ticketKeys.detail(id ?? ""),
    queryFn: ({ signal }) => ticketsApi.get(id as string, signal),
    enabled: !!id,
  });
}
