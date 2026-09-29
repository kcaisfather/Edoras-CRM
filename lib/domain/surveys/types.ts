/**
 * Memnuniyet anketi (DeepSport madde 6–7; features/surveys/types.ts'ten, Edoras'a uyarlandı).
 * Tablolar: crm_surveys, crm_survey_invitations, crm_survey_responses (supabase/migrations/20260929190000_crm_surveys.sql).
 * Puanı YALNIZ müşteri verir (herkese açık /s/[token] sayfası); panelde puan giriş alanı yoktur.
 *
 * DeepSport'tan fark: alıcı antrenör (`userId`) değil, CRM adayı (`leadId`) ve / veya Edoras kurumu (`institutionId`).
 * Zaman damgaları epoch ms.
 */

export const SURVEY_QUESTION_TYPES = ["NPS", "CSAT", "COMMENT"] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  /** Soru metni; boşsa istemcideki varsayılan çeviri kullanılır. */
  text?: string | null;
  required: boolean;
}

export interface Survey {
  id: string;
  /** Varsayılan anket: DEFAULT_NPS_CSAT (NPS 0–10 + memnuniyet 1–5 + yorum). */
  code: string;
  title: string;
  intro?: string | null;
  questions: SurveyQuestion[];
  isDefault: boolean;
  /** Davet linkinin geçerlilik süresi (gün). */
  linkValidDays: number;
  createdAt?: number | null;
}

/** GET /api/crm/surveys — anketler + e-posta gönderimi açık mı (RESEND_API_KEY ve EMAIL_FROM tanımlı). */
export interface SurveysListResponse {
  surveys: Survey[];
  mailEnabled: boolean;
}

/**
 * Kanal: EMAIL sunucudan (Resend) gider; WhatsApp / SMS / Link'te sunucu yalnız kişiye özel link üretir, mesajı
 * personel kendi gönderir ve "Gönderdim" ile işaretler (otomatik gönderim yok).
 */
export const SURVEY_CHANNELS = ["EMAIL", "WHATSAPP", "SMS", "LINK"] as const;
export type SurveyChannel = (typeof SURVEY_CHANNELS)[number];

export const SURVEY_INVITATION_STATUSES = ["CREATED", "SENT", "OPENED", "RESPONDED", "EXPIRED", "FAILED"] as const;
export type SurveyInvitationStatus = (typeof SURVEY_INVITATION_STATUSES)[number];
//   CREATED   link üretildi, personel henüz "gönderdim" demedi (WhatsApp / SMS / Link)
//   SENT      e-posta gitti ya da personel gönderdiğini işaretledi
//   OPENED    müşteri linki açtı
//   RESPONDED müşteri yanıtladı (son durum)
//   EXPIRED   link süresi doldu (okurken hesaplanır; ilk açılışta yazılır)
//   FAILED    e-posta gönderilemedi (`error` kısa hata kodu)

export interface SurveyInvitation {
  id: string;
  surveyId: string;
  token: string;
  leadId: string | null;
  /** Edoras institutions.id (yumuşak referans). */
  institutionId: string | null;
  recipientName: string | null;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
  channel: SurveyChannel;
  /** Ekrandaki durum: süresi geçmiş ve yanıtlanmamış davet EXPIRED (sunucu okurken hesaplar). */
  status: SurveyInvitationStatus;
  createdAt: number;
  sentAt: number | null;
  openedAt: number | null;
  respondedAt: number | null;
  expiresAt: number;
  /** Gönderen panel kullanıcısı (sunucu oturumdan yazar). */
  createdBy: string | null;
  createdByName: string | null;
  /** Son gönderim hatasının kısa kodu (ör. resend:422); sağlayıcı mesajı yok. */
  error: string | null;
}

/** POST /api/crm/surveys/{id}/invitations yanıtı: `reused` = 7 gün içindeki yanıtsız davet döndü (yenisi açılmadı). */
export interface CreatedSurveyInvitation extends SurveyInvitation {
  reused: boolean;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  invitationId: string;
  leadId: string | null;
  institutionId: string | null;
  /** Davetten: yanıtlayanın adı ve kurumu. */
  recipientName: string | null;
  organizationName: string | null;
  /** 0–10 */
  nps: number | null;
  /** 1–5 */
  csat: number | null;
  comment: string | null;
  createdAt: number;
}

export interface SurveySummary {
  /** Müşteriye ulaşan (gönderim anı olan) davet sayısı. */
  invitationCount: number;
  responseCount: number;
  /** 0–1 */
  responseRate: number | null;
  /** −100 … +100; yanıt yoksa null. */
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  /** 1–5 ortalaması; yanıt yoksa null. */
  csatAvg: number | null;
  lastResponseAt?: number | null;
}

/** Yanıt bekleyen son davet (rozet "yanıt bekliyor", anket araması / WhatsApp hatırlatması). */
export interface PendingInvitation {
  id: string;
  token: string;
  sentAt: number | null;
  expiresAt: number;
}

/** Aday / kurum başı memnuniyet özeti (rozet): son yanıt + sayılar. DeepSport UserSatisfaction karşılığı. */
export interface SurveySatisfaction {
  responseCount: number;
  lastNps: number | null;
  lastCsat: number | null;
  lastResponseAt: number | null;
  pendingInvitation: PendingInvitation | null;
}

/** GET /api/crm/surveys/satisfaction (parametresiz): tüm adaylar ve kurumlar için tek istek (liste rozetleri). */
export interface SatisfactionIndex {
  byLead: Record<string, SurveySatisfaction>;
  byInstitution: Record<string, SurveySatisfaction>;
}

export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

/**
 * Gönderim diyaloğundaki alıcı (istemci). Sunucu yalnız `leadId` / `institutionId`'yi okur; ad, e-posta ve telefonu
 * aday / kurum kaydından kendisi alır (istemcinin yazdığı adrese anket gitmez).
 */
export interface SurveyRecipientInput {
  leadId?: string | null;
  institutionId?: string | null;
  name?: string | null;
  organizationName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Herkese açık sayfa: GET /api/public/surveys/{token}. Başlık, giriş, sorular ve alıcının İLK adı — başka alan yok. */
export interface PublicSurvey {
  title: string;
  intro: string | null;
  questions: SurveyQuestion[];
  recipientFirstName: string | null;
}

export interface PublicSurveyAnswer {
  nps: number | null;
  csat: number | null;
  comment: string;
}
