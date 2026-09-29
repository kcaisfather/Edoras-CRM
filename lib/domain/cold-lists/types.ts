/**
 * Soğuk listeler (Madde 13): CRM'e henüz girmemiş, aranacak kişi listeleri — API yanıtı ve ekranlar bu şekilleri
 * paylaşır. Tablolar: crm_prospect_lists / crm_prospects (supabase/migrations/20260929180000_crm_prospects.sql).
 * DeepSport'ta bayrak kapalıyken tarayıcıda (localStorage) tutulan şekil; burada ekipçe paylaşılan tablolar.
 * Metin alanları boşsa "" (DeepSport şekli), telefon / e-posta normalize değilse null; zamanlar epoch ms.
 */
import type { CrmStatus } from "@/lib/domain/crm/types";

/** Arama sonucu: Aranmadı / Ulaşılamadı / İlgilenmiyor / Görüşüldü (SQL: crm_prospects_outcome_check). */
export const PROSPECT_OUTCOMES = ["NOT_CALLED", "UNREACHABLE", "NOT_INTERESTED", "TALKED"] as const;
export type ProspectOutcome = (typeof PROSPECT_OUTCOMES)[number];

export function isProspectOutcome(value: unknown): value is ProspectOutcome {
  return typeof value === "string" && (PROSPECT_OUTCOMES as readonly string[]).includes(value);
}

/** "Sıcağa taşı" ile açılabilecek aday statüleri (DeepSport MOVE_STATUSES; SQL: crm_convert_prospect). */
export const MOVE_STATUSES = ["ARANACAK", "TAKIPTE", "RANDEVU_PLANLANDI"] as const satisfies readonly CrmStatus[];
export type MoveStatus = (typeof MOVE_STATUSES)[number];

/** GET /api/crm/prospect-lists satırı. */
export interface ProspectList {
  id: string;
  name: string;
  /** İçe aktarılan dosya adı (bilgi). */
  sourceFile: string | null;
  createdAt: number;
  createdBy: string | null;
  createdByName: string | null;
  /** Listedeki kişi sayısı. */
  prospectCount: number;
}

/** GET /api/crm/prospects satırı. */
export interface Prospect {
  id: string;
  listId: string;
  firstName: string;
  lastName: string;
  organization: string;
  /** Ham telefon (dosyadaki haliyle). */
  phoneRaw: string;
  /** E.164; çevrilemediyse null. */
  phone: string | null;
  emailRaw: string;
  email: string | null;
  city: string;
  district: string;
  /** Program / tür (DeepSport branş). */
  branch: string;
  note: string;
  outcome: ProspectOutcome;
  /** Sonucun girildiği an (sunucu yazar); Aranmadı'da null. */
  outcomeAt: number | null;
  /** "Sıcağa taşı" ile açılan CRM adayı; aday sonradan silinirse null (movedAt kalır). */
  crmLeadId: string | null;
  movedAt: number | null;
  createdAt: number;
}

/** GET /api/crm/prospects?listId&page&size — sayfalı (page 0 tabanlı). */
export interface ProspectsPage {
  items: Prospect[];
  page: number;
  size: number;
  total: number;
}
