"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reportKeys, reportsApi, type ReportSubscriptionBody } from "./api";

/** Her yazma abonelik listesini yeniler (sonraki çalışma ve son gönderim sunucuda hesaplanır). */
function useInvalidateSubscriptions() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: reportKeys.subscriptions() });
}

/** Yalnız onay diyaloğundan çağrılır (gerçek alıcılara otomatik e-posta başlatır). */
export function useSaveReportSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ReportSubscriptionBody }) => (id ? reportsApi.update(id, input) : reportsApi.create(input)),
    onSuccess: invalidate,
  });
}

export function useDeleteReportSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({ mutationFn: (id: string) => reportsApi.remove(id), onSuccess: invalidate });
}

/** Yalnız onay diyaloğundan çağrılır (gerçek e-posta gönderir). */
export function useSendReportNow() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({ mutationFn: (id: string) => reportsApi.sendNow(id), onSuccess: invalidate });
}
