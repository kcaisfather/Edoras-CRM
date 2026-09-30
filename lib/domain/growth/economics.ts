/**
 * Birim ekonomisi ve gelir sızıntısı (DeepSport G27 / G97 / G98 karşılığı, kurum düzeyi). Yalnız ADMIN (tutar içerir;
 * CRM_AGENT'a lisans bedeli ve ödeme sunucuda boşaltılır). Saf; testler economics.test.ts.
 *
 * DeepSport'ta gelir "fiyatlı panel atamaları"ndan, maliyet AWS faturasından gelirdi; burada gelir `crm_licenses.price`
 * (1 yıllık lisans, 12 aya eşit yayılır), tahsilat `crm_payments`. AWS maliyeti, kur ve reklam harcaması (CAC/ROAS)
 * Edoras/CRM'de yok → taşınmadı.
 */
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { dayMs, lastMonths, type Ratio } from "./retention";
import { daysSinceActivity, totalActivity, USING_DAYS } from "./usage";
import type { GrowthCustomer, GrowthLicense } from "./types";

/** Lisans süresi (ay) — 1 dönem = 1 yıl (lib/domain/institutions/rules.ts → TERM_YEARS). */
export const LICENSE_MONTHS = 12;

export function paidLicenses(c: Pick<GrowthCustomer, "licenses">): GrowthLicense[] {
  return c.licenses.filter((l) => !l.free && (l.price ?? 0) > 0);
}

export function totalPaid(c: Pick<GrowthCustomer, "payments">): number {
  return (c.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

export function totalLicenseValue(c: Pick<GrowthCustomer, "licenses">): number {
  return paidLicenses(c).reduce((s, l) => s + (l.price ?? 0), 0);
}

/** Kalan bakiye: max(0, lisans bedelleri − tahsilat). Ödemeler bilinmiyorsa (null) 0. */
export function balanceOf(c: Pick<GrowthCustomer, "licenses" | "payments">, today = todayIso()): number {
  if (!c.payments) return 0;
  const due = paidLicenses(c)
    .filter((l) => l.startsOn <= today)
    .reduce((s, l) => s + (l.price ?? 0), 0);
  return Math.max(0, due - totalPaid(c));
}

/** Bugün süren ücretli lisans (başlangıç ≤ bugün < bitiş). */
export function activeLicense(c: Pick<GrowthCustomer, "licenses">, today = todayIso()): GrowthLicense | null {
  return paidLicenses(c).find((l) => l.startsOn <= today && today < l.endsOn) ?? null;
}

/** Yıllık yinelenen gelir (ARR): bugün süren ücretli lisansların bedeli. */
export function annualRecurringRevenue(customers: readonly GrowthCustomer[], today = todayIso()): number {
  return customers.reduce((s, c) => s + (activeLicense(c, today)?.price ?? 0), 0);
}

/** Bir ay için tahakkuk eden gelir: her ücretli lisans bedeli 12 aya eşit yayılır (başlangıç ayı dahil). */
export function amortizedMonthlyRevenue(customers: readonly Pick<GrowthCustomer, "licenses">[], month: string): number {
  const [y, m] = month.split("-").map(Number);
  const target = y * 12 + (m - 1);
  let sum = 0;
  for (const c of customers) {
    for (const l of paidLicenses(c)) {
      const s = new Date(dayMs(l.startsOn));
      const offset = target - (s.getUTCFullYear() * 12 + s.getUTCMonth());
      if (offset >= 0 && offset < LICENSE_MONTHS) sum += (l.price ?? 0) / LICENSE_MONTHS;
    }
  }
  return sum;
}

/** Ayda tahsil edilen toplam. */
export function collectedInMonth(customers: readonly Pick<GrowthCustomer, "payments">[], month: string): number {
  let sum = 0;
  for (const c of customers) for (const p of c.payments ?? []) if (p.paidOn.slice(0, 7) === month) sum += p.amount;
  return sum;
}

export interface RevenueMonth {
  month: string;
  /** Tahakkuk (12 aya yayılmış lisans geliri). */
  recognized: number;
  /** Tahsilat (ödeme kayıtları). */
  collected: number;
  /** İlk ücretli lisansı bu ay başlayan kurum sayısı ve bunların ilk lisans bedeli. */
  newCustomers: number;
  newRevenue: number;
}

/** Son `n` ay, eskiden yeniye. */
export function revenueTrend(customers: readonly GrowthCustomer[], now = new Date(), n = 12): RevenueMonth[] {
  const firstByCustomer = new Map<string, GrowthLicense>();
  for (const c of customers) {
    const first = [...paidLicenses(c)].sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
    if (first) firstByCustomer.set(c.id, first);
  }
  return lastMonths(n, now)
    .reverse()
    .map((month) => {
      let newCustomers = 0;
      let newRevenue = 0;
      for (const l of firstByCustomer.values()) {
        if (l.startsOn.slice(0, 7) === month) {
          newCustomers += 1;
          newRevenue += l.price ?? 0;
        }
      }
      return { month, recognized: amortizedMonthlyRevenue(customers, month), collected: collectedInMonth(customers, month), newCustomers, newRevenue };
    });
}

export interface EconomicsSummary {
  /** Süren ücretli kurum sayısı. */
  payingCustomers: number;
  arr: number;
  /** Aylık yinelenen gelir = ARR / 12. */
  mrr: number;
  /** Kurum başına ortalama yıllık gelir (ARPA); ücretli kurum yoksa null. */
  arpa: number | null;
  /** Tahsilat oranı: ödemeler / bedelsiz olmayan ve başlamış lisans bedelleri. */
  collection: Ratio | null;
  outstanding: number;
  /** Bedelsiz lisans oranı (tüm lisanslar içinde). */
  freeShare: Ratio;
}

export function economicsSummary(customers: readonly GrowthCustomer[], today = todayIso()): EconomicsSummary {
  let paying = 0;
  let due = 0;
  let paid = 0;
  let outstanding = 0;
  let free = 0;
  let licenses = 0;
  for (const c of customers) {
    if (activeLicense(c, today)) paying += 1;
    for (const l of c.licenses) {
      licenses += 1;
      if (l.free) free += 1;
    }
    if (c.payments) {
      const dueC = paidLicenses(c)
        .filter((l) => l.startsOn <= today)
        .reduce((s, l) => s + (l.price ?? 0), 0);
      due += dueC;
      paid += Math.min(totalPaid(c), dueC);
      outstanding += Math.max(0, dueC - totalPaid(c));
    }
  }
  const arr = annualRecurringRevenue(customers, today);
  return {
    payingCustomers: paying,
    arr,
    mrr: arr / LICENSE_MONTHS,
    arpa: paying ? arr / paying : null,
    collection: due > 0 ? { count: Math.round(paid), of: Math.round(due) } : null,
    outstanding,
    freeShare: { count: free, of: licenses },
  };
}

// ---------------------------------------------------------------------------
// Değer / kullanım (DeepSport CUSTOMER_VALUE_SUMMARY / G98 karşılığı)
// ---------------------------------------------------------------------------

export interface ValueRow {
  customer: GrowthCustomer;
  /** Süren lisansın yıllık bedeli. */
  annualValue: number;
  paid: number;
  balance: number;
  activity: number;
  daysSinceActivity: number | null;
  /** Yüksek değer, düşük kullanım: değeri süren ama 14+ gündür etkinliği olmayan kurum. */
  atRisk: boolean;
}

/** Süren ücretli lisansı olan kurumlar, değere göre azalan. `atRisk` olanlar önce gelmez — sıralama değere göredir. */
export function valueRows(customers: readonly GrowthCustomer[], now = new Date()): ValueRow[] {
  const today = todayIso(now);
  return customers
    .map((customer) => {
      const lic = activeLicense(customer, today);
      if (!lic) return null;
      const since = daysSinceActivity(customer.usage, now);
      return {
        customer,
        annualValue: lic.price ?? 0,
        paid: totalPaid(customer),
        balance: balanceOf(customer, today),
        activity: customer.usage ? totalActivity(customer.usage.counts) : 0,
        daysSinceActivity: since,
        atRisk: since == null || since > USING_DAYS,
      };
    })
    .filter((r): r is ValueRow => r != null)
    .sort((a, b) => b.annualValue - a.annualValue || a.customer.name.localeCompare(b.customer.name, "tr"));
}

// ---------------------------------------------------------------------------
// Gelir sızıntısı (DeepSport G27)
// ---------------------------------------------------------------------------

/**
 * "Süresi bitmiş ama kullanan" burada yok — tek yeri Müşteriler → Süresi Dolacaklar (bucket=expiredActive).
 *  - freeLicense: son 365 günde başlayan bedelsiz (0 ₺) lisans (DeepSport "ücretsiz atama").
 *  - unpaid:      başlamış ücretli lisansların bedelinden fazla tahsilat eksik (DeepSport "fiyatsız uzatma" karşılığı).
 */
export const LEAK_BUCKETS = ["freeLicense", "unpaid"] as const;
export type LeakBucket = (typeof LEAK_BUCKETS)[number];

export interface LeakItem {
  key: string;
  bucket: LeakBucket;
  customer: GrowthCustomer;
  /** Bedelsiz lisansın başlangıcı ya da (tahsilat eksikse) en eski açık lisansın başlangıcı. */
  date: string | null;
  /** Tahmini kayıp: eksik tahsilat; bedelsiz lisansta ücretli lisansların ortancası (yoksa null). */
  loss: number | null;
}

export function medianLicensePrice(customers: readonly GrowthCustomer[]): number | null {
  const prices = customers.flatMap((c) => paidLicenses(c).map((l) => l.price ?? 0)).sort((a, b) => a - b);
  if (!prices.length) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}

export function leakageItems(customers: readonly GrowthCustomer[], now = new Date(), sinceDays = 365): LeakItem[] {
  const today = todayIso(now);
  const median = medianLicensePrice(customers);
  const out: LeakItem[] = [];
  for (const c of customers) {
    if (!c.status || c.state === "PASIF") continue;
    const freeLicense = c.licenses
      .filter((l) => l.free && daysBetween(l.startsOn, today) <= sinceDays && l.startsOn <= today)
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
    if (freeLicense) {
      out.push({ key: `free-${c.id}`, bucket: "freeLicense", customer: c, date: freeLicense.startsOn, loss: median });
    }
    if (c.payments) {
      const balance = balanceOf(c, today);
      if (balance > 0) {
        const oldest = paidLicenses(c)
          .filter((l) => l.startsOn <= today)
          .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
        out.push({ key: `unpaid-${c.id}`, bucket: "unpaid", customer: c, date: oldest?.startsOn ?? null, loss: balance });
      }
    }
  }
  return out;
}

/** Hediye oranı: son `sinceDays` günde başlayan lisansların bedelsiz olanlarının payı. */
export function giftRatio(customers: readonly GrowthCustomer[], now = new Date(), sinceDays = 365): Ratio {
  const today = todayIso(now);
  let free = 0;
  let all = 0;
  for (const c of customers) {
    for (const l of c.licenses) {
      if (l.startsOn > today || daysBetween(l.startsOn, today) > sinceDays) continue;
      all += 1;
      if (l.free) free += 1;
    }
  }
  return { count: free, of: all };
}
