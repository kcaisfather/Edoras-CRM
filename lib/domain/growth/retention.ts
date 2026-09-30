/**
 * Retention & Churn (Müşteri Analizleri) saf hesapları — DeepSport retention.ts'in kurum uyarlaması.
 *
 * DeepSport'ta "paket dönemi" ödeme geçmişinden türetilirdi (ödeme + ürün süresi). Burada dönem KESİN: her ücretli
 * `crm_licenses` satırı bir paket (başlangıç, bitiş, bedel). Bedelsiz (0 ₺) lisanslar paket sayılmaz. Bitişten sonra
 * 30 gün içinde yeni lisans başlarsa "yenilendi", başlamazsa "churn". Takvim işlemleri UTC'dedir (tarihler saf gündür).
 * Testler retention.test.ts.
 */
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { RENEWAL_EXPIRED_LOOKBACK_DAYS, RENEWAL_WINDOW_DAYS } from "./renewals";
import { daysSinceActivity, USING_DAYS } from "./usage";
import type { GrowthCustomer } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Paket bitişinden sonra yeni lisans için tanınan süre (gün); içinde başlarsa "yenilendi". */
export const RENEWAL_GRACE_DAYS = 30;
/** Bu sayının altındaki payda düşük güvenli sayılır. */
export const LOW_CONFIDENCE_MIN = 5;
export const TREND_MONTHS = 12;
export const COHORT_MONTHS = 12;
/** Kohort sütunları M0..M12. */
export const COHORT_MAX_OFFSET = 12;
/** "Yenilendi" / "Süresi doldu" anlık segmentlerinin geriye bakışı. */
export const RECENT_OUTCOME_DAYS = RENEWAL_EXPIRED_LOOKBACK_DAYS;

export interface Ratio {
  count: number;
  of: number;
}

/** Oran → tam sayı yüzde; payda 0 ise null. */
export function percent(r: Ratio | null | undefined): number | null {
  return r && r.of ? Math.round((r.count / r.of) * 100) : null;
}

/** YYYY-MM-DD → UTC gün başı (ms). */
export function dayMs(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function monthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** Son `n` ay ("YYYY-MM"), en yeni ilk. */
export function lastMonths(n: number, now = new Date()): string[] {
  const today = todayIso(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - i, 1)).toISOString().slice(0, 7));
}

export function monthBounds(month: string): { start: number; end: number; from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const next = Date.UTC(y, m, 1);
  return { start, end: next - 1, from: new Date(start).toISOString().slice(0, 10), to: new Date(next - DAY_MS).toISOString().slice(0, 10) };
}

/** Takvim ayı ekler (UTC); ayın günü hedef ayda yoksa son güne sabitlenir. */
export function addMonths(ms: number, k: number): number {
  const d = new Date(ms);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, Math.min(d.getUTCDate(), lastDay));
}

// ---------------------------------------------------------------------------
// Paketler (ücretli lisanslar)
// ---------------------------------------------------------------------------

export interface PaidPackage {
  institutionId: string;
  start: number;
  end: number;
  /** ADMIN dışında bedel bilinmez → 0. */
  price: number;
}

/**
 * Ücretli lisansları paketlere çevirir. Bedelsiz lisanslar atlanır. Aynı kurumun aynı gün başlayan lisansları tek
 * pakettir (tutar toplanır, bitiş en geç olan) — çift kayıt yenileme sayılmasın.
 */
export function buildPackages(customers: readonly Pick<GrowthCustomer, "id" | "licenses">[]): PaidPackage[] {
  const byKey = new Map<string, PaidPackage>();
  for (const c of customers) {
    for (const l of c.licenses) {
      if (l.free) continue;
      const start = dayMs(l.startsOn);
      const end = dayMs(l.endsOn);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const key = `${c.id}|${l.startsOn}`;
      const cur = byKey.get(key);
      if (cur) {
        cur.end = Math.max(cur.end, end);
        cur.price += l.price ?? 0;
      } else {
        byKey.set(key, { institutionId: c.id, start, end, price: l.price ?? 0 });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.institutionId.localeCompare(b.institutionId));
}

function groupByInstitution<T extends { institutionId: string; start: number }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const list = map.get(it.institutionId);
    if (list) list.push(it);
    else map.set(it.institutionId, [it]);
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start);
  return map;
}

// ---------------------------------------------------------------------------
// Paket sonucu ve churn özeti
// ---------------------------------------------------------------------------

/**
 * renewed: sonraki lisans bitiş + grace içinde başladı (erken yenileme dahil).
 * churned: bitiş + grace geçti, yeni lisans yok. pending: bitti, grace sürüyor.
 * active: henüz bitmedi, yenileme lisansı da yok.
 */
export type PackageOutcome = "renewed" | "churned" | "pending" | "active";

export interface PackageResult extends PaidPackage {
  outcome: PackageOutcome;
  /** Yenileyen lisansın başlangıcı (yalnız renewed). */
  renewedAt: number | null;
}

export function classifyPackages(packages: PaidPackage[], now: number = Date.now(), graceDays: number = RENEWAL_GRACE_DAYS): PackageResult[] {
  const out: PackageResult[] = [];
  for (const list of groupByInstitution(packages).values()) {
    list.forEach((pkg, i) => {
      const windowEnd = pkg.end + graceDays * DAY_MS;
      const next = list[i + 1];
      let outcome: PackageOutcome;
      let renewedAt: number | null = null;
      if (next && next.start > pkg.start && next.start <= windowEnd) {
        outcome = "renewed";
        renewedAt = next.start;
      } else if (pkg.end > now) outcome = "active";
      else if (windowEnd > now) outcome = "pending";
      else outcome = "churned";
      out.push({ ...pkg, outcome, renewedAt });
    });
  }
  return out.sort((a, b) => a.end - b.end);
}

export interface ChurnSummary {
  /** Dönemde biten paketler (tüm sonuçlar). */
  ended: number;
  renewed: number;
  churned: number;
  /** Grace penceresi henüz kapanmamış, yenilenmemiş paketler (oranlara girmez). */
  pending: number;
  /** Sonuçlanan = yenilenen + churn (oranların paydası). */
  decided: number;
  churnRate: number | null;
  renewalRate: number | null;
  /** Sonuçlanan paketlerin bedeli ve bunun churn olan kısmı (TL). */
  revenueDecided: number;
  revenueChurned: number;
  revenueChurnRate: number | null;
  lowConfidence: boolean;
}

/** Bitişi [from, to] aralığında (ve şimdiden önce) olan paketlerden churn / yenileme oranı; `range` null → tüm zamanlar. */
export function churnSummary(results: PackageResult[], range: { from: number; to: number } | null, now: number = Date.now()): ChurnSummary {
  let renewed = 0;
  let churned = 0;
  let pending = 0;
  let revenueDecided = 0;
  let revenueChurned = 0;
  for (const r of results) {
    if (r.end > now) continue;
    if (range && (r.end < range.from || r.end > range.to)) continue;
    if (r.outcome === "renewed") {
      renewed += 1;
      revenueDecided += r.price;
    } else if (r.outcome === "churned") {
      churned += 1;
      revenueDecided += r.price;
      revenueChurned += r.price;
    } else if (r.outcome === "pending") pending += 1;
  }
  const decided = renewed + churned;
  return {
    ended: decided + pending,
    renewed,
    churned,
    pending,
    decided,
    churnRate: decided ? churned / decided : null,
    renewalRate: decided ? renewed / decided : null,
    revenueDecided,
    revenueChurned,
    revenueChurnRate: revenueDecided > 0 ? revenueChurned / revenueDecided : null,
    lowConfidence: decided < LOW_CONFIDENCE_MIN,
  };
}

export interface ChurnMonth extends ChurnSummary {
  month: string; // YYYY-MM
}

/** Son `months` ayın (eskiden yeniye) bitiş ayına göre churn / yenileme oranı. */
export function monthlyChurn(results: PackageResult[], now = new Date(), months = TREND_MONTHS): ChurnMonth[] {
  return lastMonths(months, now)
    .reverse()
    .map((month) => {
      const { start, end } = monthBounds(month);
      return { month, ...churnSummary(results, { from: start, to: end }, now.getTime()) };
    });
}

// ---------------------------------------------------------------------------
// İlk lisans kohortu
// ---------------------------------------------------------------------------

/** Kesintisiz kapsama aralıkları: bitiş + grace içinde başlayan paket öncekinin devamıdır. */
export function coverageSpells(packages: PaidPackage[], graceDays: number = RENEWAL_GRACE_DAYS): { start: number; end: number }[] {
  const spells: { start: number; end: number }[] = [];
  for (const p of [...packages].sort((a, b) => a.start - b.start)) {
    const last = spells[spells.length - 1];
    if (last && p.start <= last.end + graceDays * DAY_MS) last.end = Math.max(last.end, p.end);
    else spells.push({ start: p.start, end: p.end });
  }
  return spells;
}

export interface CohortCell {
  offset: number;
  /** count = Mk anında aktif lisansı olan, of = Mk'ye ulaşmış kohort üyesi. */
  ratio: Ratio;
  /** Kohortun bir kısmı henüz Mk'ye ulaşmadı (oran eksik üyeyle). */
  partial: boolean;
}

export interface CohortMatrixRow {
  month: string;
  size: number;
  /** Index = ay farkı (M0..M12); henüz gelinmemişse null. */
  cells: (CohortCell | null)[];
}

export interface RetentionCurvePoint {
  offset: number;
  ratio: Ratio;
  lowConfidence: boolean;
}

/**
 * İlk ücretli lisans ayına göre kohort × ay farkı. Üye Mk'de "devam ediyor" = ilk lisanstan k takvim ayı sonra kesintisiz
 * kapsama aralığında. Son `cohorts` ayın kohortları, eskiden yeniye. Eğri: her Mk için kohortların ağırlıklı ortalaması.
 * Lisans 1 yıl sürdüğü için M0..M11 fiilen "hepsi devam"dır; M12 sonrası yenileme durumunu gösterir.
 */
export function cohortMatrix(
  packages: PaidPackage[],
  now = new Date(),
  opts: { cohorts?: number; maxOffset?: number; graceDays?: number } = {}
): { rows: CohortMatrixRow[]; curve: RetentionCurvePoint[] } {
  const cohorts = opts.cohorts ?? COHORT_MONTHS;
  const maxOffset = opts.maxOffset ?? COHORT_MAX_OFFSET;
  const graceDays = opts.graceDays ?? RENEWAL_GRACE_DAYS;
  const nowMs = now.getTime();
  const months = new Set(lastMonths(cohorts, now));

  const members = new Map<string, { first: number; spells: { start: number; end: number }[] }[]>();
  for (const list of groupByInstitution(packages).values()) {
    const first = list[0];
    const key = monthKey(first.start);
    if (!months.has(key)) continue;
    const entry = { first: first.start, spells: coverageSpells(list, graceDays) };
    const cur = members.get(key);
    if (cur) cur.push(entry);
    else members.set(key, [entry]);
  }

  const rows: CohortMatrixRow[] = [...members.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => ({
      month,
      size: list.length,
      cells: Array.from({ length: maxOffset + 1 }, (_, k) => {
        let of = 0;
        let count = 0;
        for (const m of list) {
          const t = addMonths(m.first, k);
          if (t > nowMs) continue;
          of += 1;
          // Bitiş dışlayıcı: dönem [başlangıç, bitiş).
          if (m.spells.some((s) => s.start <= t && t < s.end)) count += 1;
        }
        return of ? { offset: k, ratio: { count, of }, partial: of < list.length } : null;
      }),
    }));

  const curve: RetentionCurvePoint[] = [];
  for (let k = 0; k <= maxOffset; k++) {
    let of = 0;
    let count = 0;
    for (const r of rows) {
      const c = r.cells[k];
      if (!c) continue;
      of += c.ratio.of;
      count += c.ratio.count;
    }
    if (of) curve.push({ offset: k, ratio: { count, of }, lowConfidence: of < LOW_CONFIDENCE_MIN });
  }
  return { rows, curve };
}

// ---------------------------------------------------------------------------
// Anlık devam durumu
// ---------------------------------------------------------------------------

/** Son `days` günde yenileme lisansı başlayan kurumlar. */
export function recentlyRenewedInstitutions(results: PackageResult[], now: number = Date.now(), days: number = RECENT_OUTCOME_DAYS): Set<string> {
  const since = now - days * DAY_MS;
  const ids = new Set<string>();
  for (const r of results) {
    if (r.outcome === "renewed" && r.renewedAt != null && r.renewedAt >= since && r.renewedAt <= now) ids.add(r.institutionId);
  }
  return ids;
}

/** Çubuk sırası: iyiden kötüye. */
export const CONTINUATION_STATUSES = ["activeUsing", "renewed", "activeNotUsing", "expiring", "churned"] as const;
export type ContinuationStatus = (typeof CONTINUATION_STATUSES)[number];

/**
 * Ücretli kurumun anlık devam durumu; öncelik: süresi doldu (son 90 gün, yenilemedi) → ≤60 gün kaldı →
 * son 90 günde yeniledi → kullanıyor / kullanmıyor. Demo, kayıtsız, bitişi yok ya da 90 günden önce bitmiş → null.
 */
export function continuationStatus(c: GrowthCustomer, recentlyRenewed: ReadonlySet<string>, now = new Date()): ContinuationStatus | null {
  if (c.status !== "UCRETLI" || !c.licenseEndsOn) return null;
  const d = daysBetween(todayIso(now), c.licenseEndsOn);
  if (d <= 0) return d < -RECENT_OUTCOME_DAYS ? null : "churned";
  if (d <= RENEWAL_WINDOW_DAYS) return "expiring";
  if (recentlyRenewed.has(c.id)) return "renewed";
  const since = daysSinceActivity(c.usage, now);
  return since != null && since <= USING_DAYS ? "activeUsing" : "activeNotUsing";
}

export interface ContinuationBreakdown {
  counts: Record<ContinuationStatus, number>;
  total: number;
  /** "Süresi doldu" içinden son 7 günde etkinliği olanlar (Süresi Dolacaklar → expiredActive). */
  churnedStillActive: number;
  /** Lisansı süren kurumlardan kullananlar (Aktif devam oranı). */
  ongoingUsing: Ratio;
}

export function continuationBreakdown(customers: readonly GrowthCustomer[], recentlyRenewed: ReadonlySet<string>, now = new Date()): ContinuationBreakdown {
  const counts = Object.fromEntries(CONTINUATION_STATUSES.map((s) => [s, 0])) as Record<ContinuationStatus, number>;
  let total = 0;
  let churnedStillActive = 0;
  let ongoing = 0;
  let using = 0;
  for (const c of customers) {
    const s = continuationStatus(c, recentlyRenewed, now);
    if (!s) continue;
    counts[s] += 1;
    total += 1;
    const since = daysSinceActivity(c.usage, now);
    if (s === "churned") {
      if (since != null && since <= 7) churnedStillActive += 1;
      continue;
    }
    ongoing += 1;
    if (since != null && since <= USING_DAYS) using += 1;
  }
  return { counts, total, churnedStillActive, ongoingUsing: { count: using, of: ongoing } };
}
