/**
 * CRM aday sinyalleri (DeepSportAdmin lib/domain/crm/signals.ts'ten): demo bitişi, istemci süzgeci,
 * özet ve aşama toplamları, kurum ↔ aday eşlemesi. Saf fonksiyonlar.
 *
 * DeepSport'ta demo, paket, son giriş / son test antrenör hesabından (school, lastTestTime…) okunuyordu.
 * Edoras'ta adayın demosu bağlı kurumun CRM kaydıdır (1 yıl; `institution.crm.demoEndsAt`); kullanıcı
 * bazlı giriş/test verisi CRM'e gelmediği için ilgi (sıcaklık), hazır hareketsizlik süzgeçleri ve
 * kullanım rozetleri taşınmadı.
 */

import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { foldTr } from "@/lib/domain/institutions/search";
import { CRM_STATUSES, type CrmLead, type CrmStatus, type CrmSummary, type LeadSource } from "./types";

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
}


/**
 * Tüm aday listesi üzerinde istemci süzgeci: statü, kaynak, oluşturma tarihi, görünüm ve arama (kurum, yetkili,
 * e-posta, telefon — telefon rakamlarla: "0532 123" → "+90532123…" eşleşir).
 */
export function filterLeadsClient(leads: CrmLead[], f: ClientLeadFilter, now = new Date()): CrmLead[] {
  const q = f.search?.trim() ? foldTr(f.search.trim()) : "";
  const digits = (f.search ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return leads.filter((lead) => {
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
