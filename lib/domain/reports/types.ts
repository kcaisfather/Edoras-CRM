/**
 * Madde 10 — zamanlanmış e-posta raporu (DeepSportAdmin features/reports/types.ts'ten). Tablolar:
 * crm_report_subscriptions ve crm_report_runs (supabase/migrations/20260929230000_crm_reports.sql).
 * Saatler her zaman Europe/Istanbul'dur.
 *
 * DeepSport'tan farkı: alıcılar serbest e-posta değil, CRM personelinin kimliğidir (`recipientIds`); rapor verisi
 * ekip dışına çıkamaz. E-posta adresi gönderim anında Auth'tan çözülür.
 */

export const REPORT_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

/** Rapor bölümleri — sıra e-postadaki sıradır. */
export const REPORT_SECTIONS = ["todayTasks", "endingDemos", "expiring60", "openOffers", "newSignups", "salesTotal"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

/**
 * Tutar içeren bölümler. `salesTotal` yalnız ADMIN alıcıya gider (CRM_AGENT'a hiç konmaz); `openOffers` CRM_AGENT'a
 * tutarsız gider (yalnız adet ve ad).
 */
export const FINANCIAL_REPORT_SECTIONS: readonly ReportSection[] = ["openOffers", "salesTotal"];

export const REPORT_TIMEZONE = "Europe/Istanbul";

export const REPORT_RUN_STATUSES = ["SENT", "FAILED", "SKIPPED"] as const;
export type ReportRunStatus = (typeof REPORT_RUN_STATUSES)[number];

export const MAX_REPORT_RECIPIENTS = 50;

/** Varsayılan saat (DeepSport: 08:30). */
export const DEFAULT_REPORT_TIME = "08:30";

/** Raporun kapsadığı geriye dönük gün sayısı (yeni kayıtlar, satışlar, biten demolar). */
export function periodDaysFor(frequency: ReportFrequency): number {
  return frequency === "DAILY" ? 1 : frequency === "WEEKLY" ? 7 : 30;
}

/** GET /api/reports/subscriptions satırı. Zaman damgaları epoch ms. */
export interface ReportSubscriptionDto {
  id: string;
  name: string;
  /** CRM personeli (crm_staff.user_id). */
  recipientIds: string[];
  frequency: ReportFrequency;
  /** "HH:MM", İstanbul saati. */
  time: string;
  /** Yalnız haftalık: ISO gün (1 = Pazartesi … 7 = Pazar); diğerlerinde null. */
  weekday: number | null;
  /** Yalnız aylık: ayın günü (1–28); diğerlerinde null. */
  dayOfMonth: number | null;
  sections: ReportSection[];
  timezone: typeof REPORT_TIMEZONE;
  active: boolean;
  lastSentAt: number | null;
  nextRunAt: number;
  createdByName: string | null;
  createdAt: number;
  /** En son gönderim denemesi (dağıtıcı ya da "Şimdi gönder"); hiç deneme yoksa null. */
  lastRun: { at: number; status: ReportRunStatus; sentTo: number; manual: boolean } | null;
}

/** POST /api/reports/subscriptions/{id}/send-now yanıtı. Adres döndürülmez; yalnız sayılar. */
export interface ReportSendResult {
  sentTo: number;
  failed: number;
  /** epoch ms */
  sentAt: number;
}

/** Önizleme / e-posta satırı. */
export interface ReportLine {
  key: string;
  name: string;
  /** Hazır Türkçe metin ("3 gün kaldı", "Yıllık yenileme · 2 gün gecikti"…). */
  detail: string | null;
  /** Yalnız finansal bölümlerde ve yalnız ADMIN görüntüleyicide; aksi hâlde null. */
  amount: number | null;
}

export interface ReportSectionData {
  section: ReportSection;
  title: string;
  count: number;
  /** Bölüm toplam tutarı (openOffers, salesTotal); ADMIN dışında hiç yok. */
  total: number | null;
  lines: ReportLine[];
  /** Listeye sığmayan kayıt sayısı. */
  more: number;
}

/** GET /api/reports/preview yanıtı: çağıranın rolüne göre süzülmüş, e-postadakiyle aynı içerik. */
export interface ReportPreview {
  generatedAt: number;
  /** Rapor dönemi ("son 7 gün"). */
  period: string;
  sections: ReportSectionData[];
  /** Panoya kopyalanabilir düz metin (e-postanın metin gövdesi). */
  text: string;
}
