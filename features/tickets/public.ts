"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { PublicTicketInput } from "@/lib/domain/tickets/types";
import { fetchPublicTicketPage, submitPublicTicket } from "./api";

/**
 * Herkese açık destek sayfasının veri katmanı — bilinçli olarak ayrı dosya: panel modüllerini import etmez, müşterinin
 * indirdiği sayfaya panel kodu girmez. Oturumsuz; hata tekrar denenmez (404 kalıcıdır).
 */
export function usePublicTicketPage(token: string) {
  return useQuery({
    queryKey: ["publicTicket", token],
    queryFn: () => fetchPublicTicketPage(token),
    staleTime: Infinity,
    retry: 0,
    refetchOnWindowFocus: false,
    enabled: !!token,
  });
}

export function useSubmitPublicTicket(token: string) {
  return useMutation({ mutationFn: (body: PublicTicketInput) => submitPublicTicket(token, body) });
}
