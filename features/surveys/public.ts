"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { PublicSurveyAnswer } from "@/lib/domain/surveys/types";
import { fetchPublicSurvey, submitPublicSurvey } from "./api";

/**
 * Herkese açık anket sayfasının veri katmanı — bilinçli olarak ayrı dosya: panel modüllerini (crm, kurallar) import
 * etmez, müşterinin indirdiği sayfaya panel kodu girmez. Oturumsuz; hata tekrar denenmez (404 / 409 / 410 kalıcıdır).
 */
export function usePublicSurvey(token: string) {
  return useQuery({
    queryKey: ["publicSurvey", token],
    queryFn: () => fetchPublicSurvey(token),
    staleTime: Infinity,
    retry: 0,
    refetchOnWindowFocus: false,
    enabled: !!token,
  });
}

/** Herkese açık anket yanıtı (oturumsuz). 409 = daha önce yanıtlanmış, 410 = süresi dolmuş. */
export function useSubmitPublicSurvey(token: string) {
  return useMutation({
    mutationFn: (answer: PublicSurveyAnswer) => submitPublicSurvey(token, answer),
  });
}
