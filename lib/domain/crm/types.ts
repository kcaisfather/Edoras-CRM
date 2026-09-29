/**
 * CRM aday (lead) tipleri — API yanıtı ve ekranlar bu şekilleri paylaşır.
 * Aday = potansiyel ya da mevcut müşteri kurum (supabase/migrations/20260929160000_crm_leads.sql).
 */
import type { Dissatisfaction, ProgramTag } from "@/lib/domain/crm-notes/utils";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";

/** Satış aşamaları, satış akışı sırasıyla (DeepSport'un 8 statüsü; SQL: crm_leads_status_check). */
export const CRM_STATUSES = [
  "ARANACAK",
  "ULASILAMADI",
  "RANDEVU_PLANLANDI",
  "DEMO_TANIMLANDI",
  "TEKLIF_VERILDI",
  "SATIS_OLDU",
  "OLUMSUZ",
  "TAKIPTE",
] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];

export function isCrmStatus(value: string | null | undefined): value is CrmStatus {
  return (CRM_STATUSES as readonly string[]).includes(value ?? "");
}

/**
 * Adayın kaynağı (CRM_LEAD_SOURCE). EDORAS: Edoras'ta açılmış bir kurumdan ("Yeni kayıtlar" → Aday oluştur);
 * IMPORT / COLD_LIST içe aktarma ve soğuk liste modülleriyle gelir.
 */
export const LEAD_SOURCES = ["MANUAL", "EDORAS", "IMPORT", "COLD_LIST"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Kayıp nedeni — yalnız Satış Olmadı (OLUMSUZ) statüsünde (SQL: crm_leads_lost_reason_check). */
export const LOST_REASONS = ["FIYAT", "ZAMANLAMA", "RAKIP", "IHTIYAC_YOK", "BUTCE", "DIGER"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export function isLostReason(value: string | null | undefined): value is LostReason {
  return (LOST_REASONS as readonly string[]).includes(value ?? "");
}

export type CrmStatusFilter = CrmStatus | "";

/** "dissatisfied" = Şikâyet kaydı (madde 7); kod adı DeepSport'la aynı. */
export type CrmNoteMode = "note" | "dissatisfied" | "handoff";

/**
 * GET /api/crm/leads satırı. Tutarlar (teklif, satış, tahsilat) CRM_AGENT için sunucuda null.
 * Zaman damgaları epoch ms; takvim günleri (sonraki arama, teklif, satış) YYYY-MM-DD (G09 kural 4).
 */
export interface CrmLeadDto {
  id: string;
  organizationName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  /** E.164 (+905XXXXXXXXX). */
  contactPhone: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  status: CrmStatus;
  source: LeadSource;
  offerAmount: number | null;
  saleAmount: number | null;
  /** Bağlı kurumun crm_payments toplamı (bağlı değilse 0). */
  collectedAmount: number | null;
  lostReason: LostReason | null;
  nextFollowUpAt: string | null;
  offerSentAt: string | null;
  soldAt: string | null;
  /** Edoras institutions.id (yumuşak referans). */
  institutionId: string | null;
  /** En son şikâyet kaydı (SIKAYET notu). */
  dissatisfaction: Dissatisfaction | null;
  programTags: ProgramTag[];
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Ekrandaki aday: sunucu satırı + bağlı Edoras kurumunun özeti (istemcide kurum listesiyle birleşir).
 * DeepSport'taki gibi alanlar isteğe bağlı: saf fonksiyonlar ve testler yalnız gereken alanlarla çalışır.
 */
export type CrmLead = { id: string } & Partial<Omit<CrmLeadDto, "id">> & {
    /** Bağlı kurum (Edoras + CRM kaydı); kurum listesi yüklenmediyse ya da kurum yoksa null. */
    institution?: InstitutionListItem | null;
  };

export interface CrmSummary {
  totalOffer: number;
  totalSale: number;
  totalCollected: number;
  count: number;
  /** Satış olmuş (SATIS_OLDU) kayıt sayısı. */
  saleCount?: number;
}
