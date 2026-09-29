/**
 * Anket uçlarının gövde / sorgu doğrulaması (tek kaynak: istemci ve sunucu). Aktör (created_by), token, alıcının
 * adı / e-postası / telefonu ve durum anları şemada YOKTUR: sunucu yazar ya da aday / kurum kaydından okur; gövdede
 * gelirse atılır. Kurallar veritabanında da zorunlu (supabase/migrations/20260929190000_crm_surveys.sql).
 */
import { z } from "zod";
import { COMMENT_MAX_LENGTH, CSAT_MAX, CSAT_MIN, NPS_MAX, NPS_MIN } from "./logic";
import { SURVEY_CHANNELS, SURVEY_INVITATION_STATUSES } from "./types";

const MSG = {
  recipient: "Alıcı olarak bir CRM adayı ya da kurum seçin",
  nps: `Puan ${NPS_MIN}–${NPS_MAX} arasında olmalı`,
  csat: `Memnuniyet ${CSAT_MIN}–${CSAT_MAX} arasında olmalı`,
  comment: `Yorum en çok ${COMMENT_MAX_LENGTH} karakter`,
} as const;

const uuid = z.uuid();

/**
 * POST /api/crm/surveys/{id}/invitations. DeepSport gövdesiyle uyumlu ({ recipient, channel, sendEmail, locale });
 * `sendEmail` ve `locale` yok sayılır (EMAIL kanalı her zaman sunucudan gönderir; panel yalnız Türkçe).
 */
export const createInvitationSchema = z.object({
  recipient: z
    .object({ leadId: uuid.nullish(), institutionId: uuid.nullish() })
    .refine((r) => !!r.leadId || !!r.institutionId, { message: MSG.recipient }),
  channel: z.enum(SURVEY_CHANNELS),
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;
export type CreateInvitationValues = z.output<typeof createInvitationSchema>;

/** Herkese açık yanıt (POST /api/public/surveys/{token}/responses). Zorunlu sorular crm_survey_submit'te denetlenir. */
export const publicAnswerSchema = z.object({
  nps: z.number().int().min(NPS_MIN, MSG.nps).max(NPS_MAX, MSG.nps).nullable(),
  csat: z.number().int().min(CSAT_MIN, MSG.csat).max(CSAT_MAX, MSG.csat).nullable(),
  comment: z
    .string()
    .trim()
    .max(COMMENT_MAX_LENGTH, MSG.comment)
    .nullish()
    .transform((v) => v || null),
});
export type PublicAnswerValues = z.output<typeof publicAnswerSchema>;

/** Herkese açık yanıt gövdesinin üst sınırı (yorum 2000 karakter + JSON payı). */
export const PUBLIC_ANSWER_MAX_BYTES = 16 * 1024;

export const SURVEY_PAGE_MAX = 200;

const page = z.coerce.number().int().min(0).max(10_000).default(0);
const size = z.coerce.number().int().min(1).max(SURVEY_PAGE_MAX).default(50);

/** GET /api/crm/surveys/{id}/invitations?status&channel&page&size (durum ekrandaki durumdur: EXPIRED hesaplanır). */
export const invitationQuerySchema = z.object({
  status: z.enum(SURVEY_INVITATION_STATUSES).optional(),
  channel: z.enum(SURVEY_CHANNELS).optional(),
  page,
  size,
});
export type InvitationQuery = z.output<typeof invitationQuerySchema>;

/** GET /api/crm/surveys/{id}/responses?page&size */
export const responseQuerySchema = z.object({ page, size });
export type ResponseQuery = z.output<typeof responseQuerySchema>;

/** GET /api/crm/surveys/satisfaction?leadId= | ?institutionId= (ikisi de yoksa tüm dizin). */
export const satisfactionQuerySchema = z.object({ leadId: uuid.optional(), institutionId: uuid.optional() });

/** Kişiye özel link anahtarı: sunucunun ürettiği base64url (≥ 32 bayt → ≥ 43 karakter; SQL: token_check). */
export const SURVEY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export const isSurveyToken = (value: string): boolean => SURVEY_TOKEN_PATTERN.test(value);
