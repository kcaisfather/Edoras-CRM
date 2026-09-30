/**
 * Yenileme kovaları (DeepSport G15). Kurum düzeyi: bitiş = ücretli kurumda son lisansın bitişi, demoda demo bitişi
 * (crm_licenses / crm_institutions.demo_ends_at — DeepSport'taki paket bitişi karşılığı). Saf; testler renewals.test.ts.
 *
 * Kural (lib/domain/institutions/status.ts ile aynı): dönem [başlangıç, bitiş) aralığıdır; kalan gün ≤ 0 ise bitmiştir.
 * DeepSport'taki "kontenjan doldu" kovası (quotaFull) yok: Edoras'ta koltuk/kontenjan kavramı yok.
 */
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { daysSinceActivity } from "./usage";
import type { GrowthCustomer } from "./types";

/** Yaklaşan yenileme penceresi (gün) — DeepSport EXPIRING_WINDOW_DAYS. */
export const RENEWAL_WINDOW_DAYS = 60;
/** Süresi Dolacaklar: bitişi en fazla bu kadar gün önce geçmiş kurumlar hâlâ listelenir. */
export const RENEWAL_EXPIRED_LOOKBACK_DAYS = 90;
/** "Süresi bitmiş ama kullanan": bitişten sonra bu kadar gün içinde etkinlik. */
export const RECENTLY_ACTIVE_DAYS = 7;

export const RENEWAL_BUCKETS = ["expiredActive", "d1_7", "d8_14", "d15_30", "d31_60", "expired"] as const;
export type RenewalBucket = (typeof RENEWAL_BUCKETS)[number];

/** "Süresi dolmaya yakın (≤60 gün)" birleşik süzgecinin kapsadığı kovalar. */
export const EXPIRING_SOON_BUCKETS: readonly RenewalBucket[] = ["d1_7", "d8_14", "d15_30", "d31_60"];

export const RENEWAL_BUCKET_FILTERS = ["all", "le60", ...RENEWAL_BUCKETS] as const;
export type RenewalBucketFilter = (typeof RENEWAL_BUCKET_FILTERS)[number];

export function isDemoCustomer(c: Pick<GrowthCustomer, "status">): boolean {
  return c.status === "DEMO";
}

/** Yenileme / demo bitişi (YYYY-MM-DD); yoksa null. */
export function renewalEndsOn(c: Pick<GrowthCustomer, "status" | "demoEndsAt" | "licenseEndsOn">): string | null {
  return c.status === "DEMO" ? c.demoEndsAt : c.licenseEndsOn;
}

/** Bitişe kalan gün (geçmişse ≤ 0); bitiş yoksa null. */
export function renewalDaysLeft(c: Pick<GrowthCustomer, "status" | "demoEndsAt" | "licenseEndsOn">, now = new Date()): number | null {
  const end = renewalEndsOn(c);
  return end ? daysBetween(todayIso(now), end) : null;
}

export function isRecentlyActive(c: Pick<GrowthCustomer, "usage">, now = new Date()): boolean {
  const d = daysSinceActivity(c.usage, now);
  return d != null && d <= RECENTLY_ACTIVE_DAYS;
}

/** Kurumu tek bir yenileme kovasına koyar (demo dahil); CRM kaydı yok / pasif / hiçbirine girmiyorsa null. */
export function renewalBucket(c: GrowthCustomer, now = new Date()): RenewalBucket | null {
  if (!c.status || c.state === "PASIF") return null;
  const left = renewalDaysLeft(c, now);
  if (left == null) return null;
  if (left <= 0) {
    if (left < -RENEWAL_EXPIRED_LOOKBACK_DAYS) return null;
    return isRecentlyActive(c, now) ? "expiredActive" : "expired";
  }
  if (left <= 7) return "d1_7";
  if (left <= 14) return "d8_14";
  if (left <= 30) return "d15_30";
  if (left <= RENEWAL_WINDOW_DAYS) return "d31_60";
  return null;
}

export function parseBucketFilter(value: string | null | undefined): RenewalBucketFilter {
  return (RENEWAL_BUCKET_FILTERS as readonly string[]).includes(value ?? "") ? (value as RenewalBucketFilter) : "all";
}

export function matchesBucketFilter(bucket: RenewalBucket, filter: RenewalBucketFilter): boolean {
  if (filter === "all") return true;
  if (filter === "le60") return EXPIRING_SOON_BUCKETS.includes(bucket);
  return bucket === filter;
}

export interface RenewalRow {
  customer: GrowthCustomer;
  bucket: RenewalBucket;
  daysLeft: number;
  endsOn: string;
  isDemo: boolean;
}

/** Yenileme satırları: en acil (en az kalan gün / en yakın zamanda bitmiş) önce. */
export function renewalRows(customers: readonly GrowthCustomer[], now = new Date()): RenewalRow[] {
  const rows: RenewalRow[] = [];
  for (const customer of customers) {
    const bucket = renewalBucket(customer, now);
    const endsOn = renewalEndsOn(customer);
    const daysLeft = renewalDaysLeft(customer, now);
    if (!bucket || !endsOn || daysLeft == null) continue;
    rows.push({ customer, bucket, daysLeft, endsOn, isDemo: isDemoCustomer(customer) });
  }
  return rows.sort((a, b) => {
    // Önce yaklaşanlar (kalan gün artan), sonra bitmişler (en yeni biten önce).
    const ae = a.daysLeft <= 0 ? 1 : 0;
    const be = b.daysLeft <= 0 ? 1 : 0;
    if (ae !== be) return ae - be;
    return ae ? b.daysLeft - a.daysLeft : a.daysLeft - b.daysLeft;
  });
}

export function bucketTotals(rows: readonly RenewalRow[]): Record<RenewalBucket, number> {
  const out = Object.fromEntries(RENEWAL_BUCKETS.map((b) => [b, 0])) as Record<RenewalBucket, number>;
  for (const r of rows) out[r.bucket]++;
  return out;
}
