"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crmKeys } from "@/features/crm";
import type { CreatedSurveyInvitation, SurveyChannel, SurveyRecipientInput } from "@/lib/domain/surveys/types";
import { surveysApi } from "./api";
import { surveyKeys } from "./queries";

/** Görevlerim sorgularının kökü (features/tasks → taskKeys.all): anket araması davetlerden türetilir. */
const TASKS_ROOT_KEY = [...crmKeys.all, "tasks"] as const;

function useInvalidateSurveys() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: surveyKeys.all }), qc.invalidateQueries({ queryKey: TASKS_ROOT_KEY })]);
}

export interface CreateInvitationsInput {
  surveyId: string;
  recipients: SurveyRecipientInput[];
  channel: SurveyChannel;
  /** Her istekten sonra (başarılı / başarısız) tamamlanan sayıyla çağrılır. */
  onProgress?: (done: number) => void;
  /** true dönerse kalan alıcılara davet oluşturulmaz. */
  shouldStop?: () => boolean;
}

export interface CreateInvitationsResult {
  ok: { recipient: SurveyRecipientInput; invitation: CreatedSurveyInvitation }[];
  failed: { recipient: SurveyRecipientInput; error: unknown }[];
  stopped: boolean;
}

/**
 * Toplu anket daveti: tekil uçla sıralı gönderim (her davet bir üretim yazması). Tek tek hatalar toplanır, akış
 * kesilmez; bitince (durdurulsa da) anket ve görev sorguları tazelenir. Sunucuya yalnız aday / kurum kimliği gider.
 */
export function useCreateInvitations() {
  const invalidate = useInvalidateSurveys();
  return useMutation({
    mutationFn: async ({ surveyId, recipients, channel, onProgress, shouldStop }: CreateInvitationsInput) => {
      const result: CreateInvitationsResult = { ok: [], failed: [], stopped: false };
      let count = 0;
      for (const recipient of recipients) {
        if (shouldStop?.()) {
          result.stopped = true;
          break;
        }
        try {
          const invitation = await surveysApi.createInvitation(surveyId, {
            recipient: { leadId: recipient.leadId ?? null, institutionId: recipient.institutionId ?? null },
            channel,
          });
          result.ok.push({ recipient, invitation });
        } catch (error) {
          result.failed.push({ recipient, error });
        }
        count++;
        onProgress?.(count);
      }
      return result;
    },
    onSettled: () => invalidate(),
  });
}

/** "Gönderdim": WhatsApp / SMS / Link davetini gönderildi olarak işaretler (anket araması bu andan sayılır). */
export function useMarkInvitationSent() {
  const invalidate = useInvalidateSurveys();
  return useMutation({
    mutationFn: (invitationId: string) => surveysApi.markSent(invitationId),
    onSuccess: () => invalidate(),
  });
}

/** Anket davetini e-postayla yeniden gönderir. */
export function useResendInvitation() {
  const invalidate = useInvalidateSurveys();
  return useMutation({
    mutationFn: (invitationId: string) => surveysApi.resend(invitationId),
    onSettled: () => invalidate(),
  });
}
