"use client";

import { useQuery } from "@tanstack/react-query";
import { useCrmRules } from "@/features/crm";
import { SURVEY_PAGE_MAX } from "@/lib/domain/surveys/schemas";
import { satisfactionFor } from "@/lib/domain/surveys/logic";
import { ruleMap } from "@/lib/domain/tasks/rules";
import type { Paged, Survey } from "@/lib/domain/surveys/types";
import { surveysApi } from "./api";

/**
 * Anket sorgu anahtarları. Aday yazımları (crmKeys.all) bunları tazelemez: rozet ve listeler kendi süresiyle yenilenir;
 * anket yazımları (davet, "Gönderdim", yeniden gönder) surveyKeys.all'u ve Görevlerim'i tazeler (mutations.ts).
 */
export const surveyKeys = {
  all: ["surveys"] as const,
  list: () => [...surveyKeys.all, "list"] as const,
  invitations: (surveyId: string) => [...surveyKeys.all, "invitations", surveyId] as const,
  responses: (surveyId: string) => [...surveyKeys.all, "responses", surveyId] as const,
  summary: (surveyId: string) => [...surveyKeys.all, "summary", surveyId] as const,
  satisfactionIndex: () => [...surveyKeys.all, "satisfaction", "index"] as const,
  satisfaction: (leadId: string, institutionId: string) => [...surveyKeys.all, "satisfaction", leadId, institutionId] as const,
};

/** Varsayılan anket + e-posta gönderimi açık mı (sunucuda RESEND_API_KEY ve EMAIL_FROM). */
export function useDefaultSurvey(enabled = true) {
  const query = useQuery({
    queryKey: surveyKeys.list(),
    queryFn: ({ signal }) => surveysApi.list(signal),
    staleTime: 10 * 60 * 1000,
    enabled,
  });
  const surveys = query.data?.surveys;
  const survey: Survey | null = surveys?.find((s) => s.isDefault) ?? surveys?.[0] ?? null;
  return { ...query, survey, mailEnabled: query.data?.mailEnabled ?? false };
}

export interface AllPages<T> {
  items: T[];
  total: number;
  /** Okunan sayfa sınırı aşıldı (ekranda kapsam notu). */
  truncated: boolean;
}

/** Okunacak en çok sayfa (200'er): 2000 kayıt. Fazlası `truncated` (DeepSport useAllPages maxPages: 10). */
const MAX_PAGES = 10;

async function allPages<T>(load: (page: number, size: number) => Promise<Paged<T>>): Promise<AllPages<T>> {
  const items: T[] = [];
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await load(page, SURVEY_PAGE_MAX);
    items.push(...res.items);
    total = res.total;
    if (items.length >= total || res.items.length < SURVEY_PAGE_MAX) break;
  }
  return { items, total, truncated: items.length < total };
}

/** Davetler (yeniden eskiye; ekran süzgeçleri istemcide — DeepSport ile aynı). */
export function useSurveyInvitations(surveyId: string | null | undefined) {
  return useQuery({
    queryKey: surveyKeys.invitations(surveyId ?? ""),
    queryFn: ({ signal }) => allPages((page, size) => surveysApi.invitationsPage(surveyId as string, page, size, {}, signal)),
    enabled: !!surveyId,
    staleTime: 30 * 1000,
  });
}

export function useSurveyResponses(surveyId: string | null | undefined) {
  return useQuery({
    queryKey: surveyKeys.responses(surveyId ?? ""),
    queryFn: ({ signal }) => allPages((page, size) => surveysApi.responsesPage(surveyId as string, page, size, signal)),
    enabled: !!surveyId,
    staleTime: 30 * 1000,
  });
}

export function useSurveySummary(surveyId: string | null | undefined) {
  return useQuery({
    queryKey: surveyKeys.summary(surveyId ?? ""),
    queryFn: ({ signal }) => surveysApi.summary(surveyId as string, signal),
    enabled: !!surveyId,
    staleTime: 60 * 1000,
  });
}

/**
 * Tüm adaylar ve kurumlar için memnuniyet dizini — liste rozetleri (CRM tablosu, mobil kartlar, detay) tek istekle.
 * Hata olursa rozet çizilmez (tekrar denenmez).
 */
function useSatisfactionIndex() {
  return useQuery({
    queryKey: surveyKeys.satisfactionIndex(),
    queryFn: ({ signal }) => surveysApi.satisfactionIndex(signal),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

/** Aday (ve bağlı kurumu) için memnuniyet özeti — paylaşılan dizinden; veri yoksa null. */
export function useLeadSatisfaction(ids: { leadId?: string | null; institutionId?: string | null }) {
  const index = useSatisfactionIndex();
  return { ...index, data: satisfactionFor(index.data, ids) };
}

/** Tek aday / kurum özeti (kurum ayrıntısı): sunucu bağlı aday / kurumu kendisi ekler. */
export function useSubjectSatisfaction(ids: { leadId?: string | null; institutionId?: string | null }) {
  return useQuery({
    queryKey: surveyKeys.satisfaction(ids.leadId ?? "", ids.institutionId ?? ""),
    queryFn: ({ signal }) => surveysApi.satisfaction(ids, signal),
    enabled: !!ids.leadId || !!ids.institutionId,
    staleTime: 60 * 1000,
    retry: 0,
  });
}

/** "Anket araması" eşiği: kural surveyNoResponse'un günü (crm_rules; Kurallar ekranından değişir, varsayılan 5). */
export function useSurveyFollowUpDays(): number {
  const { rules } = useCrmRules();
  return ruleMap(rules).surveyNoResponse.days;
}
