import { ApiError, apiRequest } from "@/lib/api/client";
import { isApiErrorCode, type ApiErrorBody } from "@/lib/api/error-codes";
import type { CreateInvitationInput } from "@/lib/domain/surveys/schemas";
import type {
  CreatedSurveyInvitation,
  Paged,
  PublicSurvey,
  PublicSurveyAnswer,
  SatisfactionIndex,
  SurveyChannel,
  SurveyInvitation,
  SurveyInvitationStatus,
  SurveyResponse,
  SurveySatisfaction,
  SurveySummary,
  SurveysListResponse,
} from "@/lib/domain/surveys/types";

const surveyBase = (id: string) => `/api/crm/surveys/${encodeURIComponent(id)}`;
const invitationBase = (id: string) => `/api/crm/surveys/invitations/${encodeURIComponent(id)}`;

const qs = (params: Record<string, string | number | null | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/**
 * Anket uçları (DeepSport features/surveys/api.ts sözleşmesinin Next route handler karşılığı; BACKEND_FEATURES.SURVEYS'in
 * açık yolu):
 *   GET  /api/crm/surveys                                    → { surveys, mailEnabled }
 *   GET  /api/crm/surveys/{id}/invitations?status&channel&page&size → { items, page, size, total }
 *   POST /api/crm/surveys/{id}/invitations  { recipient: { leadId?, institutionId? }, channel } → davet (+ reused)
 *   POST /api/crm/surveys/invitations/{id}/sent              → davet (WhatsApp / SMS / Link: "Gönderdim")
 *   POST /api/crm/surveys/invitations/{id}/resend            → davet (yalnız EMAIL)
 *   GET  /api/crm/surveys/{id}/responses?page&size           → { items, page, size, total }
 *   GET  /api/crm/surveys/{id}/summary                       → SurveySummary
 *   GET  /api/crm/surveys/satisfaction[?leadId|institutionId] → SatisfactionIndex | SurveySatisfaction
 */
export const surveysApi = {
  list: (signal?: AbortSignal) => apiRequest<SurveysListResponse>("/api/crm/surveys", { signal }),
  invitationsPage: (
    surveyId: string,
    page: number,
    size: number,
    filters: { status?: SurveyInvitationStatus; channel?: SurveyChannel } = {},
    signal?: AbortSignal
  ) => apiRequest<Paged<SurveyInvitation>>(`${surveyBase(surveyId)}/invitations${qs({ page, size, ...filters })}`, { signal }),
  responsesPage: (surveyId: string, page: number, size: number, signal?: AbortSignal) =>
    apiRequest<Paged<SurveyResponse>>(`${surveyBase(surveyId)}/responses${qs({ page, size })}`, { signal }),
  summary: (surveyId: string, signal?: AbortSignal) => apiRequest<SurveySummary>(`${surveyBase(surveyId)}/summary`, { signal }),
  satisfactionIndex: (signal?: AbortSignal) => apiRequest<SatisfactionIndex>("/api/crm/surveys/satisfaction", { signal }),
  satisfaction: (ids: { leadId?: string | null; institutionId?: string | null }, signal?: AbortSignal) =>
    apiRequest<SurveySatisfaction>(`/api/crm/surveys/satisfaction${qs(ids)}`, { signal }),
  /** Tek alıcıya davet (EMAIL ise sunucu hemen gönderir). Üretim yazması — yalnız onaylı eylemden çağrılır. */
  createInvitation: (surveyId: string, body: CreateInvitationInput) =>
    apiRequest<CreatedSurveyInvitation>(`${surveyBase(surveyId)}/invitations`, { method: "POST", body }),
  markSent: (invitationId: string) => apiRequest<SurveyInvitation>(`${invitationBase(invitationId)}/sent`, { method: "POST" }),
  resend: (invitationId: string) => apiRequest<SurveyInvitation>(`${invitationBase(invitationId)}/resend`, { method: "POST" }),
};

// ---------------------------------------------------------------------------
// Herkese açık (oturumsuz) — apiRequest bilinçli olarak KULLANILMAZ: çerez gönderilmez (credentials: "omit") ve
// hiçbir yanıtta panel girişine yönlendirilmez. Uçlar asla 401 dönmez (404 / 409 / 410 / 429).
// ---------------------------------------------------------------------------

async function publicRequest<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method,
      credentials: "omit",
      cache: "no-store",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Network error", 0);
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;
  const code = (data as Partial<ApiErrorBody> | null)?.error?.code;
  const known = isApiErrorCode(code) ? code : null;
  throw new ApiError(known ?? `HTTP ${res.status}`, res.status, known);
}

const publicBase = (token: string) => `/api/public/surveys/${encodeURIComponent(token)}`;

export function fetchPublicSurvey(token: string): Promise<PublicSurvey> {
  return publicRequest<PublicSurvey>(publicBase(token), { method: "GET" });
}

export function submitPublicSurvey(token: string, answer: PublicSurveyAnswer): Promise<void> {
  return publicRequest<void>(`${publicBase(token)}/responses`, {
    method: "POST",
    body: { nps: answer.nps, csat: answer.csat, comment: answer.comment.trim() || null },
  });
}
