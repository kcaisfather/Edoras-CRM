/**
 * Maliyet defterinin toplamları ve ay sonu tahmini (DeepSport CostSummary / trend / forecast karşılığı). Saf; testler
 * aggregate.test.ts. Girdi yalnız `{ service, month, amountTry }`: veritabanı ve ekran aynı hesabı kullanır.
 */
import { addMonthsKey, dayOfMonth, elapsedFraction, monthOfDay, monthsEndingAt } from "./months";
import {
  COST_SERVICES,
  USAGE_BASED_SERVICES,
  type CostOverview,
  type CostService,
  type ServiceMonthRow,
  type ServicesMatrix,
  type TrendPoint,
} from "./types";

export interface LedgerLine {
  service: CostService;
  month: string;
  amountTry: number;
}

/** Ay içinde "hız"la tahmine geçmek için gereken en az gün (öncesinde tek gün verisi aşırı büyütür). */
export const PACE_MIN_DAY = 5;
export const TREND_MONTHS = 12;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type MonthTotals = Map<string, Partial<Record<CostService, number>>>;

/** Satırları ay → hizmet → TL toplamına indirger. */
export function totalsByMonth(lines: readonly LedgerLine[]): MonthTotals {
  const out: MonthTotals = new Map();
  for (const l of lines) {
    const row = out.get(l.month) ?? {};
    row[l.service] = round2((row[l.service] ?? 0) + l.amountTry);
    out.set(l.month, row);
  }
  return out;
}

export function monthTotal(totals: MonthTotals, month: string): number {
  const row = totals.get(month);
  return row ? round2(COST_SERVICES.reduce((s, svc) => s + (row[svc] ?? 0), 0)) : 0;
}

export function serviceTotal(totals: MonthTotals, month: string, service: CostService): number {
  return totals.get(month)?.[service] ?? 0;
}

/**
 * Bir hizmetin içinde bulunulan ayın tahmini toplamı.
 *  - Kullanıma bağlı (SMS, OpenAI): ayın 5'inden sonra girilen tutar aya oranlanır (hız); öncesinde ya da hiç girilmemişse
 *    girilen ile geçen ayın büyüğü.
 *  - Diğerleri (sabit aylık kalemler): max(girilen, geçen ay) — henüz girilmemiş bir sabit kalemin sürmesi beklenir.
 * `today` YYYY-MM-DD (Europe/Istanbul günü).
 */
export function forecastService(service: CostService, mtd: number, previous: number, today: string): number {
  if (USAGE_BASED_SERVICES.includes(service)) {
    if (mtd > 0 && dayOfMonth(today) >= PACE_MIN_DAY) return round2(mtd / elapsedFraction(today));
    return round2(Math.max(mtd, previous));
  }
  return round2(Math.max(mtd, previous));
}

/** İçinde bulunulan ayın hizmet bazında tahmini (tüm hizmetler). */
export function forecastByService(totals: MonthTotals, today: string): Record<CostService, number> {
  const month = monthOfDay(today);
  const prev = addMonthsKey(month, -1);
  return Object.fromEntries(
    COST_SERVICES.map((s) => [s, forecastService(s, serviceTotal(totals, month, s), serviceTotal(totals, prev, s), today)])
  ) as Record<CostService, number>;
}

export function forecastTotal(totals: MonthTotals, today: string): number {
  return round2(Object.values(forecastByService(totals, today)).reduce((s, v) => s + v, 0));
}

/** Bir ayın hizmet payları (büyükten küçüğe; 0 olan hizmetler yok). */
export function serviceShares(totals: MonthTotals, month: string): ServiceMonthRow[] {
  const total = monthTotal(totals, month);
  return COST_SERVICES.map((service) => ({ service, amountTry: serviceTotal(totals, month, service) }))
    .filter((r) => r.amountTry > 0)
    .sort((a, b) => b.amountTry - a.amountTry)
    .map((r) => ({ ...r, sharePct: total > 0 ? (r.amountTry / total) * 100 : 0 }));
}

export function trendPoints(totals: MonthTotals, endMonth: string, months = TREND_MONTHS): TrendPoint[] {
  return monthsEndingAt(endMonth, months).map((month) => ({
    month,
    totalTry: monthTotal(totals, month),
    byService: { ...(totals.get(month) ?? {}) },
  }));
}

/** Genel bakış (özet kartları + hizmet payları + 12 aylık eğilim). `activeAlerts` çağıran tarafından doldurulur. */
export function buildOverview(lines: readonly LedgerLine[], today: string): Omit<CostOverview, "activeAlerts"> {
  const totals = totalsByMonth(lines);
  const month = monthOfDay(today);
  const previous = monthTotal(totals, addMonthsKey(month, -1));
  const forecast = forecastTotal(totals, today);
  return {
    month,
    monthToDateTry: monthTotal(totals, month),
    forecastTry: forecast,
    previousMonthTry: previous,
    monthOverMonthPct: previous > 0 ? ((forecast - previous) / previous) * 100 : null,
    byService: serviceShares(totals, month),
    trend: trendPoints(totals, month),
    hasEntries: lines.length > 0,
  };
}

/** Hizmet × ay matrisi (Hizmetler ekranı): `months` eskiden yeniye. */
export function buildServicesMatrix(lines: readonly LedgerLine[], months: readonly string[]): ServicesMatrix {
  const totals = totalsByMonth(lines);
  const rows = COST_SERVICES.map((service) => {
    const byMonth = months.map((m) => serviceTotal(totals, m, service));
    return { service, byMonth, totalTry: round2(byMonth.reduce((s, v) => s + v, 0)) };
  }).filter((r) => r.totalTry > 0);
  const totalsByMonthList = months.map((m) => monthTotal(totals, m));
  return { months: [...months], rows, totalsByMonth: totalsByMonthList, grandTotalTry: round2(totalsByMonthList.reduce((s, v) => s + v, 0)) };
}
