/**
 * Madde 4 — "Teklif verildi" statüsü, kayıp nedeni, sonraki arama tarihi (DeepSportAdmin
 * lib/domain/crm/offer.ts'in CRM_OFFER_FIELDS AÇIK yolu). DeepSport'ta bayrak kapalıyken kullanılan
 * `[TEKLIF|…]` / `[TAKIP|…]` not yedeği yok: bilgi crm_leads kolonlarındadır. Statü yazımının kuralları
 * (`applyStatusChange`) sunucuda uygulanır; form yalnız statü, tarih ve nedeni gönderir.
 * Saf fonksiyonlar — testler offer.test.ts'te.
 */

import type { CrmLead, CrmStatus, LostReason } from "./types";

/** Sonraki arama alanının gösterildiği statüler (düzenleme ve ekleme formları). */
export const FOLLOW_UP_STATUSES: CrmStatus[] = ["TEKLIF_VERILDI", "TAKIPTE", "OLUMSUZ"];

/**
 * Statü seçilince önerilen sonraki arama (bugünden +gün). DeepSport'ta /crm/rules'daki "offer" (+3) ve
 * "lostRecontact" (+90) kurallarından okunur; kural motoru taşınınca oradan okunacak.
 */
export const FOLLOW_UP_SUGGEST_DAYS: Partial<Record<CrmStatus, number>> = { TEKLIF_VERILDI: 3, OLUMSUZ: 90 };

export interface LeadFollowUp {
  displayStatus: CrmStatus | null;
  offerOpen: boolean;
  /** Teklif tarihi (YYYY-MM-DD). */
  offerDate: string | null;
  /** Sonraki arama tarihi (YYYY-MM-DD). */
  nextDate: string | null;
  lostReason: LostReason | null;
  /** Takibin yazıldığı an (kayıp → yeniden temas kuralı için): kaydın son güncellenmesi. */
  markedAt: number | null;
}

export const EMPTY_FOLLOW_UP: LeadFollowUp = {
  displayStatus: null,
  offerOpen: false,
  offerDate: null,
  nextDate: null,
  lostReason: null,
  markedAt: null,
};

/** YYYY-MM-DD → yerel gün başı (ms). */
export function isoToMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Yerel takvim günü (YYYY-MM-DD). */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDaysIso(base: Date | string, days: number): string {
  const d = typeof base === "string" ? new Date(isoToMs(base)) : new Date(base);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Adayın teklif / takip durumu (kolonlardan). */
export function leadFollowUp(lead: CrmLead): LeadFollowUp {
  const offerOpen = lead.status === "TEKLIF_VERILDI";
  return {
    displayStatus: lead.status ?? null,
    offerOpen,
    offerDate: lead.offerSentAt ?? null,
    nextDate: lead.nextFollowUpAt ?? null,
    lostReason: lead.lostReason ?? null,
    markedAt: lead.updatedAt ?? null,
  };
}

export interface StatusWriteInput {
  status: CrmStatus;
  /** Sonraki arama tarihi (YYYY-MM-DD) ya da null. */
  nextDate: string | null;
  lostReason: LostReason | null;
}

/** crm_leads'e yazılacak statü kolonları; `undefined` = dokunulmaz. */
export interface StatusColumns {
  status: CrmStatus;
  next_follow_up_at: string | null;
  lost_reason: LostReason | null;
  offer_sent_at?: string;
  sold_at?: string | null;
}

/**
 * Statü değişikliğinin kolon karşılığı (DeepSport `planStatusWrite`, bayrak açık yol + satış tarihi):
 * - sonraki arama yalnız takip statülerinde (Teklif verildi / Takipte / Satış olmadı) kalır, diğerlerinde silinir;
 * - kayıp nedeni yalnız Satış olmadı'da;
 * - teklif tarihi yalnız teklife GEÇİŞTE bugün olur, diğer durumlarda korunur;
 * - satış tarihi satışa geçişte bugün olur, satıştan çıkınca silinir (SQL: crm_leads_sold_at_check).
 * `today` YYYY-MM-DD (Türkiye takvim günü).
 */
export function applyStatusChange(
  current: Pick<CrmLead, "status">,
  input: StatusWriteInput,
  today: string
): StatusColumns {
  const target = input.status;
  const out: StatusColumns = {
    status: target,
    next_follow_up_at: FOLLOW_UP_STATUSES.includes(target) ? input.nextDate : null,
    lost_reason: target === "OLUMSUZ" ? input.lostReason : null,
  };
  if (target === "TEKLIF_VERILDI" && current.status !== "TEKLIF_VERILDI") out.offer_sent_at = today;
  if (target === "SATIS_OLDU" && current.status !== "SATIS_OLDU") out.sold_at = today;
  if (target !== "SATIS_OLDU") out.sold_at = null;
  return out;
}

/** Sonraki arama gününe kaç gün var (geçmişse negatif); tarih yoksa null. */
export function daysToIso(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((isoToMs(iso) - today) / (24 * 60 * 60 * 1000));
}

/** Takip sıralaması: sonraki arama tarihi en yakın/gecikmiş önce, tarihsizler sonda. */
export function compareFollowUps(a: LeadFollowUp, b: LeadFollowUp): number {
  if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
  if (a.nextDate) return -1;
  if (b.nextDate) return 1;
  return 0;
}
