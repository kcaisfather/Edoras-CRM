/**
 * Kullanım tanımları (DeepSport Madde 14 karşılığı, kurum düzeyi). Saf hesaplar; testler usage.test.ts.
 *
 *  - Kullanıyor:         son 14 günde en az bir etkinlik (yoklama, ödev, deneme, konu, duyuru, elle SMS).
 *  - Kullanmıyor:        son 14 günde etkinlik yok (hiç etkinliği olmayanlar dahil).
 *  - Hiç aktive olmamış: hiç etkinliği yok + kurum 30 günden eski (DeepSport "dummy hesap" temizliğinin karşılığı).
 */
import { addDays, daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { ACTIVITY_SOURCES, type GrowthCustomer, type SourceCounts, type SourceDates, type UsageSignals } from "./types";

export const USING_DAYS = 14;
export const NO_ACTIVITY_DAYS = 30;
export const NEVER_ACTIVATED_MIN_AGE_DAYS = 30;
export const DORMANT_PAYER_DAYS = 90;
/** Sunucunun izin verdiği sayı pencereleri (gün). Edoras sorgusu ≤ 180 gün ile sınırlı. */
export const WINDOW_DAYS_OPTIONS = [7, 30, 90] as const;
export const DEFAULT_WINDOW_DAYS = 30;
export const MAX_WINDOW_DAYS = 180;

export function emptyCounts(): SourceCounts {
  return Object.fromEntries(ACTIVITY_SOURCES.map((s) => [s, 0])) as SourceCounts;
}

export function emptyDates(): SourceDates {
  return Object.fromEntries(ACTIVITY_SOURCES.map((s) => [s, null])) as SourceDates;
}

/** En yeni etkinlik günü (kaynaklar arası). */
export function latestDate(dates: SourceDates): string | null {
  let max: string | null = null;
  for (const s of ACTIVITY_SOURCES) {
    const d = dates[s];
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

/** Penceredeki toplam etkinlik. */
export function totalActivity(counts: SourceCounts): number {
  return ACTIVITY_SOURCES.reduce((sum, s) => sum + counts[s], 0);
}

/** Kaç farklı kaynakta etkinlik var (özellik çeşitliliği). */
export function activeSourceCount(counts: SourceCounts): number {
  return ACTIVITY_SOURCES.filter((s) => counts[s] > 0).length;
}

/** Son etkinlikten bu yana gün; hiç etkinlik yoksa null. */
export function daysSinceActivity(usage: Pick<UsageSignals, "lastActivityOn"> | null | undefined, now = new Date()): number | null {
  if (!usage?.lastActivityOn) return null;
  return daysBetween(usage.lastActivityOn, todayIso(now));
}

export function isUsing(usage: Pick<UsageSignals, "lastActivityOn"> | null | undefined, now = new Date()): boolean {
  const d = daysSinceActivity(usage, now);
  return d != null && d <= USING_DAYS;
}

/** Kurumun yaşı (gün); tarih yoksa null. */
export function ageDays(createdAt: string | null, now = new Date()): number | null {
  if (!createdAt) return null;
  const day = createdAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return daysBetween(day, todayIso(now));
}

/** Hiç etkinliği olmayan ve yeterince eski (dummy / hiç aktive olmamış) kurum. */
export function isNeverActivated(c: Pick<GrowthCustomer, "usage" | "createdAt">, now = new Date()): boolean {
  if (!c.usage || c.usage.lastActivityOn) return false;
  // Hiçbir kaynak okunamadıysa "hiç yok" değil "bilinmiyor".
  if (c.usage.unavailable.length >= ACTIVITY_SOURCES.length) return false;
  const age = ageDays(c.createdAt, now);
  return age != null && age >= NEVER_ACTIVATED_MIN_AGE_DAYS;
}

export const ACTIVITY_BUCKETS = ["d7", "d14", "d30", "d90", "older", "never"] as const;
export type ActivityBucket = (typeof ACTIVITY_BUCKETS)[number];

export function activityBucket(usage: Pick<UsageSignals, "lastActivityOn"> | null | undefined, now = new Date()): ActivityBucket {
  const d = daysSinceActivity(usage, now);
  if (d == null) return "never";
  if (d <= 7) return "d7";
  if (d <= 14) return "d14";
  if (d <= 30) return "d30";
  if (d <= 90) return "d90";
  return "older";
}

export function bucketCounts(customers: readonly Pick<GrowthCustomer, "usage">[], now = new Date()): Record<ActivityBucket, number> {
  const out = Object.fromEntries(ACTIVITY_BUCKETS.map((b) => [b, 0])) as Record<ActivityBucket, number>;
  for (const c of customers) if (c.usage) out[activityBucket(c.usage, now)]++;
  return out;
}

export type UsageFilter = "using" | "notUsing";

/** Hazır süzgeçler (DeepSport CrmPreset karşılığı). */
export const USAGE_PRESETS = ["inactive14", "noActivity30"] as const;
export type UsagePreset = (typeof USAGE_PRESETS)[number];

/**
 * inactive14: daha önce etkinliği olan ama 14+ gündür etkinliği olmayan kurum;
 * noActivity30: 30+ gündür etkinlik yok (hiç olmayanlar dahil).
 */
export function matchesPreset(c: Pick<GrowthCustomer, "usage">, preset: UsagePreset, now = new Date()): boolean {
  if (!c.usage) return false;
  const d = daysSinceActivity(c.usage, now);
  if (preset === "inactive14") return d != null && d > USING_DAYS;
  return d == null || d > NO_ACTIVITY_DAYS;
}

export function matchesUsage(c: Pick<GrowthCustomer, "usage">, filter: UsageFilter, now = new Date()): boolean {
  if (!c.usage) return false;
  return isUsing(c.usage, now) === (filter === "using");
}

/** Pencere başlangıcı (YYYY-MM-DD, Türkiye günü): bugünden `days` gün önce. */
export function windowStart(days: number, now = new Date()): string {
  return addDays(todayIso(now), -days);
}

/** Bilinmeyen / sınır dışı pencere → varsayılan. */
export function parseWindowDays(value: string | number | null | undefined): number {
  const n = Number(value);
  return (WINDOW_DAYS_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_WINDOW_DAYS;
}

/** Zaman damgası → Türkiye günü (YYYY-MM-DD); `date` kolonu değeri (YYYY-MM-DD) olduğu gibi. Ayrıştırılamazsa ilk 10 karakter. */
export function toDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value.slice(0, 10) : todayIso(d);
}
