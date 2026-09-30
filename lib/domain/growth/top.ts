/**
 * "Sadık (Top 50)": en çok etkinliği olan kurumlar (DeepSport top-users.ts karşılığı: en çok test yapan kullanıcılar).
 * Saf; testler top.test.ts. Sıralama: penceredeki toplam etkinlik ↓, farklı özellik sayısı ↓, son etkinlik ↓, ad.
 */
import { activeSourceCount, totalActivity } from "./usage";
import type { GrowthCustomer } from "./types";

export const TOP_INSTITUTIONS_LIMIT = 50;

export interface TopInstitutionRow {
  /** 1'den başlayan sıra. */
  rank: number;
  customer: GrowthCustomer;
  /** Penceredeki toplam etkinlik. */
  activity: number;
  /** Kaç farklı özellik (kaynak) kullanılmış. */
  sources: number;
}

/** Etkinliği olan kurumları sıralar; `exclude` true dönenler (ör. iç kurumlar) girmez. */
export function topInstitutions(
  customers: readonly GrowthCustomer[],
  { limit = TOP_INSTITUTIONS_LIMIT, exclude }: { limit?: number; exclude?: (c: GrowthCustomer) => boolean } = {}
): TopInstitutionRow[] {
  return customers
    .filter((c) => c.usage && !exclude?.(c))
    .map((customer) => {
      const counts = (customer.usage as NonNullable<GrowthCustomer["usage"]>).counts;
      return { customer, activity: totalActivity(counts), sources: activeSourceCount(counts) };
    })
    .filter((r) => r.activity > 0)
    .sort(
      (a, b) =>
        b.activity - a.activity ||
        b.sources - a.sources ||
        (b.customer.usage?.lastActivityOn ?? "").localeCompare(a.customer.usage?.lastActivityOn ?? "") ||
        a.customer.name.localeCompare(b.customer.name, "tr") ||
        a.customer.id.localeCompare(b.customer.id)
    )
    .slice(0, Math.max(0, limit))
    .map((r, i) => ({ rank: i + 1, ...r }));
}
