/**
 * Aday tablosu sütun sıralaması (?sort=&dir=, lib/utils/sort ile).
 */
import type { SortValue } from "@/lib/utils/sort";
import { STORED_STATUSES, leadBalance } from "./signals";
import { getLeadTitle } from "./utils";
import type { CrmLead } from "./types";

export const CRM_SORT_KEYS = ["customer", "location", "date", "stage", "sale", "collected", "balance"] as const;
export type CrmSortKey = (typeof CRM_SORT_KEYS)[number];

/** Aşama sırası satış akışına göre (Aranacak → … → Takipte); statüsüz sonda. */
export const CRM_SORT_ACCESSORS: Record<CrmSortKey, (lead: CrmLead) => SortValue> = {
  customer: (l) => getLeadTitle(l).title,
  location: (l) => l.city || l.country || null,
  /** Son güncelleme (durum değişince yenilenir); yoksa kayıt tarihi. */
  date: (l) => l.updatedAt ?? l.createdAt ?? null,
  stage: (l) => {
    const i = l.status ? STORED_STATUSES.indexOf(l.status) : -1;
    return i < 0 ? null : i;
  },
  // Sütun satış yoksa teklif tutarını gösterir; sıralama da aynı değerle.
  sale: (l) => l.saleAmount || l.offerAmount || null,
  collected: (l) => l.collectedAmount || null,
  balance: (l) => leadBalance(l) || null,
};
