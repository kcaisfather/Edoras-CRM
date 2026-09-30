/**
 * Kurum segmentleri (DeepSport "Müşteriler → kullanıcı düzeyi segmentler" karşılığı). Saf; testler segments.test.ts.
 *
 *  - neverActivated: hiç etkinliği olmayan ve 30 günden eski kurum (DeepSport "Dummy hesaplar / Hiç giriş yapmamış"
 *                    karşılığı; USER_CLEANUP'ın silme eylemi burada YOK — Edoras'ta silme yalnız edoras-admin'de).
 *  - noStudents:     öğrenci eklememiş (DeepSport "Sporcu eklememiş").
 *  - noTeachers:     kurumda öğretmen hesabı yok.
 *  - dormantPayers:  lisansı süren (ücretli) ama 90+ gündür etkinliği olmayan kurum (DeepSport "6+ ay girmeyen ödeyenler").
 */
import { daysSinceActivity, DORMANT_PAYER_DAYS, isNeverActivated } from "./usage";
import type { GrowthCustomer } from "./types";

export const CUSTOMER_SEGMENTS = ["neverActivated", "noStudents", "noTeachers", "dormantPayers"] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export function isCustomerSegment(value: string): value is CustomerSegment {
  return (CUSTOMER_SEGMENTS as readonly string[]).includes(value);
}

/** Ücretli, lisansı süren kurum. */
export function isPayingNow(c: Pick<GrowthCustomer, "state">): boolean {
  return c.state === "UCRETLI";
}

export function inSegment(c: GrowthCustomer, segment: CustomerSegment, now = new Date()): boolean {
  if (c.state === "PASIF" || !c.usage) return false;
  switch (segment) {
    case "neverActivated":
      return isNeverActivated(c, now);
    case "noStudents":
      return c.usage.students === 0;
    case "noTeachers":
      return c.usage.teachers === 0;
    case "dormantPayers": {
      if (!isPayingNow(c)) return false;
      const d = daysSinceActivity(c.usage, now);
      return d == null || d > DORMANT_PAYER_DAYS;
    }
  }
}

export function segmentCounts(customers: readonly GrowthCustomer[], now = new Date()): Record<CustomerSegment, number> {
  const out = Object.fromEntries(CUSTOMER_SEGMENTS.map((s) => [s, 0])) as Record<CustomerSegment, number>;
  for (const c of customers) for (const s of CUSTOMER_SEGMENTS) if (inSegment(c, s, now)) out[s]++;
  return out;
}
