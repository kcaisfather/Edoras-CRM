/**
 * Aday satış toplamları ve kırılımları (DeepSportAdmin features/crm/sales-aggregate.ts'ten) — saf fonksiyonlar.
 *
 * Satış sayılan aday: satış tutarı > 0 ya da statü "Satış oldu" (tutar girilmemişse 0 TL).
 * Satış tarihi = `soldAt` (satışa geçilen gün, sunucu yazar); yoksa son güncelleme, o da yoksa oluşturma.
 * Bakiye = max(0, satış − tahsilat). Edoras'ta ürün kataloğu olmadığından (tek ürün: 1 yıllık lisans)
 * DeepSport'un "Ürün" kırılımı ve fatura köprüsü (leadToSaleRecord) taşınmadı.
 */
import { isoToMs } from "./offer";
import { leadBalance } from "./signals";
import type { CrmLead } from "./types";
import { getContactName } from "./utils";

export interface SalesTotals {
  count: number;
  /** Ciro: Σ satış tutarı. */
  amount: number;
  collected: number;
  /** Σ max(0, satış − tahsilat). */
  balance: number;
}

export interface SalesGroup extends SalesTotals {
  key: string;
  label: string;
  sublabel?: string | null;
  institutionId?: string | null;
  lastDate: number | null;
}

function num(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function isSaleLead(l: Pick<CrmLead, "saleAmount" | "status">): boolean {
  return num(l.saleAmount) > 0 || l.status === "SATIS_OLDU";
}

export function saleLeads<T extends Pick<CrmLead, "saleAmount" | "status">>(leads: ReadonlyArray<T>): T[] {
  return leads.filter(isSaleLead);
}

/** Satış tarihi (epoch ms): satış günü, yoksa son güncelleme, o da yoksa oluşturma. */
export function saleDate(l: Pick<CrmLead, "soldAt" | "updatedAt" | "createdAt">): number | null {
  if (l.soldAt) return isoToMs(l.soldAt);
  return l.updatedAt ?? l.createdAt ?? null;
}

export { leadBalance };

function add(t: SalesTotals, l: CrmLead) {
  t.count += 1;
  t.amount += num(l.saleAmount);
  t.collected += num(l.collectedAmount);
  t.balance += leadBalance(l);
}

/** KPI satırı: Satış adedi, Ciro, Tahsil edilen, Kalan bakiye — yalnız satış sayılan adaylar. */
export function salesTotals(leads: ReadonlyArray<CrmLead>): SalesTotals {
  const t: SalesTotals = { count: 0, amount: 0, collected: 0, balance: 0 };
  for (const l of leads) if (isSaleLead(l)) add(t, l);
  return t;
}

/** "Bakiyesi olanlar": kalan > 0 olan satışlar, bakiyeye göre azalan (eşitlikte yeni tarih önce). */
export function leadsWithBalance(leads: ReadonlyArray<CrmLead>): CrmLead[] {
  return leads
    .filter((l) => isSaleLead(l) && leadBalance(l) > 0)
    .sort((a, b) => leadBalance(b) - leadBalance(a) || (saleDate(b) ?? 0) - (saleDate(a) ?? 0));
}

// --- Kırılımlar (Aylık / Müşteri) ---

/** YYYY-MM (yerel); tarih yoksa "". */
export function monthKey(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function leadName(l: CrmLead): string {
  return getContactName(l) || l.organizationName || l.contactEmail || "—";
}

function groupBy(
  leads: ReadonlyArray<CrmLead>,
  keyOf: (l: CrmLead) => string,
  labelOf: (l: CrmLead, key: string) => { label: string; sublabel?: string | null; institutionId?: string | null }
): SalesGroup[] {
  const map = new Map<string, SalesGroup>();
  for (const l of leads) {
    if (!isSaleLead(l)) continue;
    const key = keyOf(l);
    let g = map.get(key);
    if (!g) {
      g = { key, ...labelOf(l, key), count: 0, amount: 0, collected: 0, balance: 0, lastDate: null };
      map.set(key, g);
    }
    add(g, l);
    const d = saleDate(l);
    if (d != null && (g.lastDate == null || d > g.lastDate)) g.lastDate = d;
  }
  return [...map.values()];
}

/** Ay bazında (yeniden eskiye); tarihsizler "" anahtarında, en sonda. `label` = anahtar (YYYY-MM). */
export function groupSalesByMonth(leads: ReadonlyArray<CrmLead>): SalesGroup[] {
  return groupBy(leads, (l) => monthKey(saleDate(l)), (_l, key) => ({ label: key })).sort((a, b) =>
    a.key === "" ? 1 : b.key === "" ? -1 : b.key.localeCompare(a.key)
  );
}

/** Müşteri anahtarı: bağlı kurum > e-posta > aday id. */
export function customerKey(l: Pick<CrmLead, "institutionId" | "contactEmail" | "id">): string {
  if (l.institutionId) return `i:${l.institutionId}`;
  const email = l.contactEmail?.trim().toLowerCase();
  if (email) return `e:${email}`;
  return `l:${l.id}`;
}

/** Müşteri bazında (ciroya göre azalan); kurum adı varsa başlık, kişi adı alt satır. */
export function groupSalesByCustomer(leads: ReadonlyArray<CrmLead>): SalesGroup[] {
  return groupBy(leads, customerKey, (l) => ({
    label: l.organizationName || leadName(l),
    sublabel: l.organizationName ? leadName(l) : (l.contactEmail ?? null),
    institutionId: l.institutionId ?? null,
  })).sort((a, b) => b.amount - a.amount || b.count - a.count);
}
