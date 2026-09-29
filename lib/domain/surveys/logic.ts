/**
 * Anket için saf mantık (DeepSport features/surveys/logic.ts'ten): NPS / memnuniyet hesapları, özet, yanıt doğrulaması,
 * davetin ekrandaki durumu (süre dolumu okurken hesaplanır — zamanlayıcı yok), memnuniyet rozeti özeti ve "anket
 * araması" girdisi. Link ve mesaj üretimi ./message.ts'te. Tarayıcı / framework API'si kullanmaz.
 */
import { normalizeEmail, normalizeTrPhone } from "@/lib/utils/phone";
import type {
  PendingInvitation,
  PublicSurveyAnswer,
  SatisfactionIndex,
  Survey,
  SurveyChannel,
  SurveyInvitation,
  SurveyInvitationStatus,
  SurveyRecipientInput,
  SurveyResponse,
  SurveySatisfaction,
  SurveySummary,
} from "./types";

export const NPS_MIN = 0;
export const NPS_MAX = 10;
export const CSAT_MIN = 1;
export const CSAT_MAX = 5;

export type NpsCategory = "promoter" | "passive" | "detractor";

/** NPS kovası: 9–10 destekçi, 7–8 pasif, 0–6 eleştirmen. */
export function npsCategory(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

function isValidInt(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

export const isValidNps = (n: unknown): n is number => isValidInt(n, NPS_MIN, NPS_MAX);
export const isValidCsat = (n: unknown): n is number => isValidInt(n, CSAT_MIN, CSAT_MAX);

/** NPS = %destekçi − %eleştirmen (−100…+100, tam sayıya yuvarlanır); geçerli puan yoksa null. */
export function computeNps(scores: ReadonlyArray<number | null | undefined>): number | null {
  const valid = scores.filter(isValidNps);
  if (valid.length === 0) return null;
  const promoters = valid.filter((s) => s >= 9).length;
  const detractors = valid.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / valid.length) * 100);
}

/** Yanıt listesinden özet (GET /api/crm/surveys/{id}/summary da bunu kullanır). */
export function summarizeResponses(
  responses: ReadonlyArray<Pick<SurveyResponse, "nps" | "csat" | "createdAt">>,
  invitationCount: number
): SurveySummary {
  const npsScores = responses.map((r) => r.nps).filter(isValidNps);
  const csatScores = responses.map((r) => r.csat).filter(isValidCsat);
  const cats = npsScores.map(npsCategory);
  const csatAvg = csatScores.length
    ? Math.round((csatScores.reduce((a, b) => a + b, 0) / csatScores.length) * 10) / 10
    : null;
  const last = responses.reduce<number | null>((m, r) => (m == null || r.createdAt > m ? r.createdAt : m), null);
  return {
    invitationCount,
    responseCount: responses.length,
    responseRate: invitationCount > 0 ? Math.min(1, responses.length / invitationCount) : null,
    nps: computeNps(npsScores),
    promoters: cats.filter((c) => c === "promoter").length,
    passives: cats.filter((c) => c === "passive").length,
    detractors: cats.filter((c) => c === "detractor").length,
    csatAvg,
    lastResponseAt: last,
  };
}

export type SatisfactionLevel = "good" | "neutral" | "bad";

/**
 * Salt okunur memnuniyet rozeti seviyesi — yalnızca müşterinin kendi verdiği puandan.
 * NPS öncelikli; yoksa memnuniyet (4–5 iyi, 3 nötr, 1–2 kötü). Puan yoksa null.
 */
export function satisfactionLevel(nps: number | null | undefined, csat: number | null | undefined): SatisfactionLevel | null {
  if (isValidNps(nps)) {
    const c = npsCategory(nps);
    return c === "promoter" ? "good" : c === "passive" ? "neutral" : "bad";
  }
  if (isValidCsat(csat)) return csat >= 4 ? "good" : csat === 3 ? "neutral" : "bad";
  return null;
}

// ---------------------------------------------------------------------------
// Yanıt formu (herkese açık sayfa; aynı kurallar crm_survey_submit'te de zorunlu)
// ---------------------------------------------------------------------------

export const COMMENT_MAX_LENGTH = 2000;

export type AnswerError = "npsRequired" | "csatRequired" | "commentRequired" | "npsRange" | "csatRange" | "commentTooLong";

export function validateAnswer(
  answer: PublicSurveyAnswer,
  required: { nps: boolean; csat: boolean; comment?: boolean }
): AnswerError[] {
  const errors: AnswerError[] = [];
  if (answer.nps == null) {
    if (required.nps) errors.push("npsRequired");
  } else if (!isValidNps(answer.nps)) errors.push("npsRange");
  if (answer.csat == null) {
    if (required.csat) errors.push("csatRequired");
  } else if (!isValidCsat(answer.csat)) errors.push("csatRange");
  const comment = answer.comment.trim();
  if (!comment && required.comment) errors.push("commentRequired");
  if (comment.length > COMMENT_MAX_LENGTH) errors.push("commentTooLong");
  return errors;
}

/**
 * Varsayılan anket — veritabanındaki DEFAULT_NPS_CSAT kaydının istemci aynası (migration 20260929190000 ile AYNI
 * tutulur; soru metinleri boşsa ekranda messages/features/surveys.tr.json → surveys.form varsayılanları çıkar).
 */
export const DEFAULT_SURVEY: Survey = {
  id: "default",
  code: "DEFAULT_NPS_CSAT",
  title: "Edoras memnuniyet anketi",
  intro: null,
  questions: [
    { id: "nps", type: "NPS", text: null, required: true },
    { id: "csat", type: "CSAT", text: null, required: true },
    { id: "comment", type: "COMMENT", text: null, required: false },
  ],
  isDefault: true,
  linkValidDays: 30,
};

export function requiredFlags(survey: Pick<Survey, "questions">): { nps: boolean; csat: boolean; comment: boolean } {
  const req = (type: string) => survey.questions.some((q) => q.type === type && q.required);
  return { nps: req("NPS"), csat: req("CSAT"), comment: req("COMMENT") };
}

/** Bir kişi (aday ya da kurum) için son yanıt; rozet ve kurum ayrıntısı için. */
export function latestResponseFor<T extends Pick<SurveyResponse, "leadId" | "institutionId" | "createdAt">>(
  responses: ReadonlyArray<T>,
  ids: { leadId?: string | null; institutionId?: string | null }
): T | null {
  let best: T | null = null;
  for (const r of responses) {
    const match = (ids.leadId && r.leadId === ids.leadId) || (ids.institutionId && r.institutionId === ids.institutionId);
    if (match && (!best || r.createdAt > best.createdAt)) best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Davet durumu (zamanlayıcı yok: süre dolumu okurken hesaplanır)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aynı alıcıya bu kadar gün içinde yanıtsız davet varsa yenisi açılmaz (crm_create_survey_invitation). */
export const SURVEY_REUSE_DAYS = 7;

/** Kural surveyNoResponse'un varsayılanı (crm_rules): anket gönderildi + bu kadar gün yanıt yok → "Anket araması". */
export const SURVEY_FOLLOW_UP_DAYS = 5;

/** Ekrandaki durum: süresi geçmiş ve yanıtlanmamış davet EXPIRED (tablo tembelce, ilk açılışta yazar). */
export function effectiveStatus(
  inv: { status: SurveyInvitationStatus; expiresAt: number | null | undefined },
  now: number
): SurveyInvitationStatus {
  if (inv.status === "RESPONDED" || inv.status === "EXPIRED") return inv.status;
  return inv.expiresAt != null && inv.expiresAt <= now ? "EXPIRED" : inv.status;
}

/** Link hâlâ yanıtlanabilir mi (kopyala / hatırlat / yeniden gönder düğmeleri). */
export function isInvitationOpen(inv: Pick<SurveyInvitation, "status" | "expiresAt">, now: number): boolean {
  const s = effectiveStatus(inv, now);
  return s !== "RESPONDED" && s !== "EXPIRED";
}

/** Gönderilmiş (SENT / OPENED), süresi dolmamış ve yanıtlanmamış davet — anket araması adayı. */
function isAwaiting<T extends Pick<SurveyInvitation, "status" | "sentAt" | "expiresAt">>(inv: T, now: number): inv is T & { sentAt: number } {
  if (inv.status !== "SENT" && inv.status !== "OPENED") return false;
  if (inv.sentAt == null) return false;
  return inv.expiresAt == null || inv.expiresAt > now;
}

/**
 * Yanıt bekleyen ve `days` gündür sessiz davet mi? DeepSport'tan fark: CREATED (link üretildi ama personel "gönderdim"
 * demedi) sayılmaz — müşteriye ulaştığı bilinmeyen davet için arama önerilmez.
 */
export function isAwaitingFollowUp(
  inv: Pick<SurveyInvitation, "status" | "sentAt" | "expiresAt">,
  now: number,
  days: number = SURVEY_FOLLOW_UP_DAYS
): boolean {
  return isAwaiting(inv, now) && now - inv.sentAt >= days * DAY_MS;
}

/**
 * Görevlerim girdisi (kural surveyNoResponse): aday başına yanıt bekleyen EN SON gönderilmiş davetin gönderim anı.
 * Adayı olmayan davet kuruma bağlı adaydan bulunur; ikisi de yoksa görev olmaz (crm_tasks'ta anket görevi adaya
 * bağlıdır — crm_tasks_subject_check).
 */
export function awaitingSurveyByLead(
  invitations: ReadonlyArray<Pick<SurveyInvitation, "status" | "sentAt" | "expiresAt" | "leadId" | "institutionId">>,
  leadOfInstitution: ReadonlyMap<string, string>,
  now: number
): Map<string, number> {
  const out = new Map<string, number>();
  for (const inv of invitations) {
    if (!isAwaiting(inv, now)) continue;
    const leadId = inv.leadId ?? (inv.institutionId ? leadOfInstitution.get(inv.institutionId) : undefined);
    if (!leadId) continue;
    if (inv.sentAt > (out.get(leadId) ?? -Infinity)) out.set(leadId, inv.sentAt);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Memnuniyet rozeti (aday / kurum başı özet)
// ---------------------------------------------------------------------------

type SatisfactionResponse = Pick<SurveyResponse, "leadId" | "institutionId" | "nps" | "csat" | "createdAt">;
type SatisfactionInvitation = Pick<SurveyInvitation, "id" | "token" | "status" | "sentAt" | "createdAt" | "expiresAt" | "leadId" | "institutionId">;

const emptySatisfaction = (): SurveySatisfaction => ({
  responseCount: 0,
  lastNps: null,
  lastCsat: null,
  lastResponseAt: null,
  pendingInvitation: null,
});

function addResponse(s: SurveySatisfaction, r: SatisfactionResponse) {
  s.responseCount++;
  if (s.lastResponseAt == null || r.createdAt > s.lastResponseAt) {
    s.lastResponseAt = r.createdAt;
    s.lastNps = r.nps;
    s.lastCsat = r.csat;
  }
}

/** Davetin sırası: gönderim anı, yoksa (CREATED) oluşturma anı. */
const pendingTime = (inv: Pick<SurveyInvitation, "sentAt" | "createdAt">) => inv.sentAt ?? inv.createdAt;

/**
 * Yanıtlar + davetlerden aday ve kurum başına özet. Bekleyen davet: yanıtlanmamış, süresi dolmamış, başarısız olmayan
 * (CREATED / SENT / OPENED) en son davet.
 */
export function buildSatisfactionIndex(
  responses: ReadonlyArray<SatisfactionResponse>,
  invitations: ReadonlyArray<SatisfactionInvitation>,
  now: number
): SatisfactionIndex {
  const index: SatisfactionIndex = { byLead: {}, byInstitution: {} };
  const slot = (map: Record<string, SurveySatisfaction>, id: string) => (map[id] ??= emptySatisfaction());
  for (const r of responses) {
    if (r.leadId) addResponse(slot(index.byLead, r.leadId), r);
    if (r.institutionId) addResponse(slot(index.byInstitution, r.institutionId), r);
  }
  // Eskiden yeniye: sonra gelen (daha yeni) davet öncekinin yerine yazılır.
  const pending = invitations
    .filter((inv) => inv.status !== "FAILED" && isInvitationOpen(inv, now))
    .sort((a, b) => pendingTime(a) - pendingTime(b));
  for (const inv of pending) {
    const p: PendingInvitation = { id: inv.id, token: inv.token, sentAt: inv.sentAt, expiresAt: inv.expiresAt };
    if (inv.leadId) slot(index.byLead, inv.leadId).pendingInvitation = p;
    if (inv.institutionId) slot(index.byInstitution, inv.institutionId).pendingInvitation = p;
  }
  return index;
}

/** İki özeti birleştirir (aday + bağlı kurum): son yanıt ve son bekleyen davet kazanır; sayı en büyük olan. */
function mergeSatisfaction(a: SurveySatisfaction | undefined, b: SurveySatisfaction | undefined): SurveySatisfaction | null {
  if (!a || !b) return a ?? b ?? null;
  const latest = (b.lastResponseAt ?? -1) > (a.lastResponseAt ?? -1) ? b : a;
  const pa: PendingInvitation | null = a.pendingInvitation;
  const pb: PendingInvitation | null = b.pendingInvitation;
  const pending = !pa ? pb : !pb ? pa : (pb.sentAt ?? 0) > (pa.sentAt ?? 0) ? pb : pa;
  return {
    // Aynı yanıt çoğunlukla ikisinde de sayılır (aday kuruma bağlıysa); toplamak iki kez sayardı.
    responseCount: Math.max(a.responseCount, b.responseCount),
    lastNps: latest.lastNps,
    lastCsat: latest.lastCsat,
    lastResponseAt: latest.lastResponseAt,
    pendingInvitation: pending,
  };
}

/** Rozetin özeti: adayın kendisi + (varsa) bağlı kurumu. Hiç veri yoksa null. */
export function satisfactionFor(
  index: SatisfactionIndex | null | undefined,
  ids: { leadId?: string | null; institutionId?: string | null }
): SurveySatisfaction | null {
  if (!index) return null;
  return mergeSatisfaction(
    ids.leadId ? index.byLead[ids.leadId] : undefined,
    ids.institutionId ? index.byInstitution[ids.institutionId] : undefined
  );
}

// ---------------------------------------------------------------------------
// Alıcı uygunluğu (gönderim diyaloğu)
// ---------------------------------------------------------------------------

/** EMAIL için geçerli e-posta, WHATSAPP / SMS için geçerli telefon gerekir; LINK her alıcıya uygundur. */
export function recipientSkipReason(
  r: Pick<SurveyRecipientInput, "email" | "phone" | "leadId" | "institutionId">,
  channel: SurveyChannel
): "noEmail" | "noPhone" | "noIdentity" | null {
  if (!r.leadId && !r.institutionId) return "noIdentity";
  if (channel === "EMAIL" && !normalizeEmail(r.email)) return "noEmail";
  if ((channel === "WHATSAPP" || channel === "SMS") && !normalizeTrPhone(r.phone)) return "noPhone";
  return null;
}

/** Aynı kişiyi (aday, yoksa kurum) iki kez eklememek için tekilleştirir; ilk kayıt kalır. */
export function dedupeRecipients<T extends Pick<SurveyRecipientInput, "leadId" | "institutionId">>(list: ReadonlyArray<T>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of list) {
    const key = r.leadId ? `l:${r.leadId}` : r.institutionId ? `i:${r.institutionId}` : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(r);
  }
  return out;
}
