/**
 * Aday tablosu sütun sıralaması (?sort=&dir=, lib/utils/sort ile).
 */
import type { SortValue } from "@/lib/utils/sort";
import { leadScore } from "./score";
import { STORED_STATUSES, leadBalance } from "./signals";
import { getLeadTitle } from "./utils";
import type { CrmLead } from "./types";

export const CRM_SORT_KEYS = ["customer", "location", "date", "stage", "score", "sale", "collected", "balance"] as const;
export type CrmSortKey = (typeof CRM_SORT_KEYS)[number];

/** Aşama sırası satış akışına göre (Aranacak → … → Takipte); statüsüz sonda. */
export const CRM_SORT_ACCESSORS: Record<CrmSortKey, (lead: CrmLead) => SortValue> = {
  customer: (l) => getLeadTitle(l).title,
  location: (l) => l.city || l.country || null,
  date: (l) => l.createdAt ?? null,
  stage: (l) => {
    const i = l.status ? STORED_STATUSES.indexOf(l.status) : -1;
    return i < 0 ? null : i;
  },
  /** Lead skoru; puanlanmayanlar (satış oldu / olumsuz) sıralamada sonda. */
  score: (l) => leadScore(l)?.score ?? null,
  sale: (l) => l.saleAmount || null,
  collected: (l) => l.collectedAmount || null,
  balance: (l) => leadBalance(l) || null,
};
