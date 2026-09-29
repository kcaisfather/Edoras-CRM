/**
 * Tahsilat (satışa eklenen ödemeler) — DeepSportAdmin features/crm/collections.ts'in COLLECTIONS AÇIK yolu.
 *
 * EdorasCRM'de ayrı tahsilat tablosu yoktur: adayın tahsilatı bağlı kurumun ödemeleridir
 * (crm_payments.institution_id = lead.institution_id). Toplam tahsilat = o ödemelerin toplamı; açık alacak
 * = satış − tahsilat. Ödeme kuralı (adres + TC/VKN) veritabanında `crm_guard_payment` ile zorunludur.
 * DeepSport'un `[TAHSILAT|…]` not yedeği ve "önceki (tarihsiz) tahsilat" satırı burada gereksiz.
 */
import type { PaymentMethod } from "@/lib/domain/institutions/types";
import { leadBalance } from "./signals";
import type { CrmLead } from "./types";

/** Tek tahsilat kaydı (bağlı kurumun bir crm_payments satırı). */
export interface CollectionRecord {
  id: string;
  institutionId: string;
  /** TRY, > 0. */
  amount: number;
  /** Tahsilat günü (YYYY-MM-DD). */
  date: string;
  method: PaymentMethod;
  note: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function collectionsTotal(list: ReadonlyArray<Pick<CollectionRecord, "amount">>): number {
  return round2(list.reduce((s, c) => s + c.amount, 0));
}

/** En son tahsilat günü (YYYY-MM-DD); yoksa null. */
export function latestCollectionDate(list: ReadonlyArray<Pick<CollectionRecord, "date">>): string | null {
  let best: string | null = null;
  for (const c of list) if (best == null || c.date > best) best = c.date;
  return best;
}

/** Tutar alanının varsayılanı: kalan bakiye (yoksa boş). */
export function defaultCollectionAmount(lead: Pick<CrmLead, "saleAmount" | "collectedAmount">): string {
  const b = leadBalance(lead);
  return b > 0 ? String(round2(b)) : "";
}

export interface CollectionPlan {
  /** Yeni toplam tahsilat. */
  nextCollected: number;
  /** Kalan bakiyeyi aşan kısım (0 = fazla ödeme yok). */
  overpay: number;
  /** Tahsilattan sonra kalan bakiye. */
  balanceAfter: number;
}

/** Eklenecek tutarın etkisi (fazla ödemeye izin verilir; ekranda uyarı). */
export function planCollection(lead: Pick<CrmLead, "saleAmount" | "collectedAmount">, amount: number): CollectionPlan {
  const prev = lead.collectedAmount ?? 0;
  const balance = leadBalance(lead);
  const nextCollected = round2(prev + amount);
  return {
    nextCollected,
    overpay: Math.max(0, round2(amount - balance)),
    balanceAfter: Math.max(0, round2((lead.saleAmount ?? 0) - nextCollected)),
  };
}

/** Kurum başına tahsilat toplamı (sunucu listesi için). */
export function sumByInstitution(rows: ReadonlyArray<{ institution_id: string; amount: number | string }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.institution_id, round2((out.get(r.institution_id) ?? 0) + Number(r.amount)));
  return out;
}

/**
 * Tahsilat penceresinin ön koşulu: aday bir kuruma bağlı, kurum CRM'e kayıtlı ve fatura bilgisi tam
 * olmalı (aksi hâlde veritabanı reddeder; ekranda önceden açıkça söylenir).
 */
export type CollectionBlock = "notLinked" | "notEnrolled" | "billingMissing" | null;

export function collectionBlock(lead: Pick<CrmLead, "institutionId" | "institution">): CollectionBlock {
  if (!lead.institutionId) return "notLinked";
  // Kurum listesi henüz gelmediyse engelleme; sunucu yine denetler.
  if (lead.institution === undefined) return null;
  if (!lead.institution?.crm) return "notEnrolled";
  if (!lead.institution.crm.billingComplete) return "billingMissing";
  return null;
}
