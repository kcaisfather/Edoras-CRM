/**
 * CRM aday sinyalleri (DeepSportAdmin lib/domain/crm/signals.ts'ten): demo bitişi, istemci süzgeci,
 * özet ve aşama toplamları, kurum ↔ aday eşlemesi. Saf fonksiyonlar.
 *
 * DeepSport'ta demo, paket, son giriş / son test antrenör hesabından (school, lastTestTime…) okunuyordu.
 * Edoras'ta adayın demosu bağlı kurumun CRM kaydıdır (süre kurum bazlı; `institution.crm.demoEndsAt`); kullanıcı
 * bazlı giriş/test verisi CRM'e gelmediği için ilgi (sıcaklık), hazır hareketsizlik süzgeçleri ve
 * kullanım rozetleri taşınmadı.
 */

import type { ProgramTag } from "@/lib/domain/crm-notes/utils";
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { foldTr } from "@/lib/domain/institutions/search";
import { phoneMatches, presenceMatches, sameText, textIncludes, type PresenceFilter } from "@/lib/utils/filter-match";
import { CRM_STATUSES, type CrmLead, type CrmStatus, type CrmSummary, type LeadSource, type LostReason } from "./types";

/** Süzülebilen / toplanabilen statüler — CRM_OFFER_FIELDS açık yol: hepsi (Teklif verildi dahil). */
export const STORED_STATUSES: CrmStatus[] = [...CRM_STATUSES];

/** "Demo bitti, satış yok" penceresi (gün): demosu son bu kadar günde bitmiş adaylar. */
export const DEMO_ENDED_WINDOW_DAYS = 30;

/** Bağlı kurumun demo bitişi (YYYY-MM-DD); kurum demoda değilse ya da bağlı değilse null. */
export function demoEndDate(lead: Pick<CrmLead, "institution">): string | null {
  const crm = lead.institution?.crm;
  return crm?.status === "DEMO" ? crm.demoEndsAt : null;
}

/** Bağlı kurumun demosu son 30 günde bitmiş ve satış olmamış (kurum hâlâ DEMO, aday Satış Oldu değil). */
export function isDemoEndedNoSale(lead: CrmLead, now = new Date()): boolean {
  if (lead.status === "SATIS_OLDU") return false;
  const end = demoEndDate(lead);
  if (!end) return false;
  const left = daysBetween(todayIso(now), end);
  return left <= 0 && left >= -DEMO_ENDED_WINDOW_DAYS;
}

export type CrmClientTab = "demoEnded" | "balance";

/** Kalan bakiye: max(0, satış − tahsilat) (satır, özet ve "Bakiyesi olanlar" aynı formül). */
export function leadBalance(lead: Pick<CrmLead, "saleAmount" | "collectedAmount">): number {
  return Math.max(0, (lead.saleAmount ?? 0) - (lead.collectedAmount ?? 0));
}

/** Sorumlu süzgecinde "sorumlusuz" değeri (?owner=none). */
export const OWNER_NONE = "none";

/**
 * Detaylı süzgeç "Sonraki arama" seçenekleri (Türkiye takvim günü): gecikmiş (tarih bugünden önce), bugün,
 * önümüzdeki 7 gün (bugün dahil, bugün + 6 gün), tarih yok.
 */
export const FOLLOW_UP_FILTERS = ["overdue", "today", "week", "none"] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

export function isFollowUpFilter(value: string | null | undefined): value is FollowUpFilter {
  return (FOLLOW_UP_FILTERS as readonly string[]).includes(value ?? "");
}

/** "Önümüzdeki 7 gün" penceresi (bugün dahil gün sayısı). */
export const FOLLOW_UP_WEEK_DAYS = 7;

/** Sonraki arama günü (YYYY-MM-DD ya da boş) seçilen pencereye düşüyor mu? `today` YYYY-MM-DD. */
export function followUpMatches(nextFollowUpAt: string | null | undefined, filter: FollowUpFilter, today: string): boolean {
  if (!nextFollowUpAt) return filter === "none";
  if (filter === "none") return false;
  const left = daysBetween(today, nextFollowUpAt);
  if (filter === "overdue") return left < 0;
  if (filter === "today") return left === 0;
  return left >= 0 && left < FOLLOW_UP_WEEK_DAYS;
}

export interface ClientLeadFilter {
  status?: string;
  /** Aday kaynağı ("Tümü" menüsünün Kaynaklar grubu, ?source=). */
  source?: LeadSource;
  dateFrom?: number;
  dateTo?: number;
  search?: string;
  tab?: CrmClientTab;
  /** Sorumlu: personel kimliği ya da "none" (sorumlusuz). Boş = tümü. */
  owner?: string;
  // --- Detaylı süzgeç (Filtreler paneli; hepsi VE ile birleşir, boş = hepsi) ---
  /** İl / ilçe: tam eşleşme, Türkçe büyük/küçük harf ve ı/i farkı yok sayılır. */
  city?: string;
  district?: string;
  /** Telefon rakamları ("0532 123" → "+90532123…" eşleşir). */
  phone?: string;
  email?: string;
  /** Kurum adı: adayın kurum adı ya da bağlı Edoras kurumunun adı içinde geçer. */
  organization?: string;
  /** Yetkili: "ad soyad" içinde geçer. */
  contact?: string;
  program?: ProgramTag;
  lostReason?: LostReason;
  followUp?: FollowUpFilter;
  hasPhone?: PresenceFilter;
  hasEmail?: PresenceFilter;
  /** Edoras kurumuna bağlı mı (institutionId). */
  linked?: PresenceFilter;
  /** Şikâyet kaydı var mı (en son şikâyet notu). */
  complaint?: PresenceFilter;
}

/** Detaylı süzgeç alanları (statü / kaynak / görünüm / arama dışındakiler) — saf, `filterLeadsClient` içinden. */
function matchesDetail(lead: CrmLead, f: ClientLeadFilter, today: string): boolean {
  if (f.city && !sameText(lead.city, f.city)) return false;
  if (f.district && !sameText(lead.district, f.district)) return false;
  if (f.phone && !phoneMatches(f.phone, lead.contactPhone)) return false;
  if (f.email && !textIncludes(lead.contactEmail, f.email)) return false;
  if (f.organization && !textIncludes(lead.organizationName, f.organization) && !textIncludes(lead.institution?.name, f.organization)) {
    return false;
  }
  if (f.contact && !textIncludes([lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" "), f.contact)) return false;
  if (f.program && !(lead.programTags ?? []).includes(f.program)) return false;
  if (f.lostReason && lead.lostReason !== f.lostReason) return false;
  if (f.followUp && !followUpMatches(lead.nextFollowUpAt, f.followUp, today)) return false;
  if (f.hasPhone && !presenceMatches(!!lead.contactPhone?.trim(), f.hasPhone)) return false;
  if (f.hasEmail && !presenceMatches(!!lead.contactEmail?.trim(), f.hasEmail)) return false;
  if (f.linked && !presenceMatches(!!lead.institutionId, f.linked)) return false;
  if (f.complaint && !presenceMatches(lead.dissatisfaction != null, f.complaint)) return false;
  return true;
}

/**
 * Tüm aday listesi üzerinde istemci süzgeci: statü, kaynak, oluşturma tarihi, görünüm, arama (kurum, yetkili,
 * e-posta, telefon — telefon rakamlarla: "0532 123" → "+90532123…" eşleşir) ve detaylı süzgeç (il, ilçe, telefon,
 * e-posta, kurum adı, yetkili, program, kayıp nedeni, sonraki arama, var/yok alanları).
 */
export function filterLeadsClient(leads: CrmLead[], f: ClientLeadFilter, now = new Date()): CrmLead[] {
  const q = f.search?.trim() ? foldTr(f.search.trim()) : "";
  const digits = (f.search ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const today = todayIso(now);
  return leads.filter((lead) => {
    if (!matchesDetail(lead, f, today)) return false;
    if (f.status && lead.status !== f.status) return false;
    if (f.source && lead.source !== f.source) return false;
    if (f.owner && (f.owner === OWNER_NONE ? lead.ownerId != null : lead.ownerId !== f.owner)) return false;
    if (f.dateFrom != null && (lead.createdAt ?? 0) < f.dateFrom) return false;
    if (f.dateTo != null && (lead.createdAt ?? 0) > f.dateTo) return false;
    if (f.tab === "demoEnded" && !isDemoEndedNoSale(lead, now)) return false;
    if (f.tab === "balance" && !(leadBalance(lead) > 0)) return false;
    if (q) {
      const hay = foldTr(
        [lead.organizationName, lead.contactFirstName, lead.contactLastName, lead.contactEmail, lead.whatsappUsername, lead.institution?.name]
          .filter(Boolean)
          .join(" ")
      );
      const phoneHit = digits.length >= 3 && (lead.contactPhone ?? "").replace(/\D/g, "").includes(digits);
      if (!hay.includes(q) && !phoneHit) return false;
    }
    return true;
  });
}

// --- Özet ve aşamalar (G03, G35) ---

export function summarizeLeads(leads: CrmLead[]): CrmSummary {
  return leads.reduce<CrmSummary>(
    (acc, l) => ({
      totalOffer: acc.totalOffer + (l.offerAmount ?? 0),
      totalSale: acc.totalSale + (l.saleAmount ?? 0),
      totalCollected: acc.totalCollected + (l.collectedAmount ?? 0),
      count: acc.count + 1,
      saleCount: (acc.saleCount ?? 0) + (l.status === "SATIS_OLDU" ? 1 : 0),
    }),
    { totalOffer: 0, totalSale: 0, totalCollected: 0, count: 0, saleCount: 0 }
  );
}

export interface PipelineStage {
  status: CrmStatus;
  count: number;
  offer: number;
}

export function pipelineByStatus(leads: CrmLead[], statuses: CrmStatus[] = STORED_STATUSES): PipelineStage[] {
  return statuses.map((status) => {
    const inStage = leads.filter((l) => l.status === status);
    return {
      status,
      count: inStage.length,
      offer: inStage.reduce((sum, l) => sum + (l.offerAmount ?? 0), 0),
    };
  });
}

// --- Kurum ↔ aday eşlemesi (CRM_LEAD_USER_ID_FILTER karşılığı: userId yerine institutionId) ---

export function buildLeadIndex<T extends Pick<CrmLead, "institutionId">>(leads: T[]): Map<string, T> {
  const byInstitution = new Map<string, T>();
  for (const lead of leads) if (lead.institutionId) byInstitution.set(lead.institutionId, lead);
  return byInstitution;
}
