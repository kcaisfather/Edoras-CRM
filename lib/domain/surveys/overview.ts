/**
 * Genel NPS özeti için saf mantık: tüm anketlerin yanıtlarından aylık NPS eğilimi. Ay, Europe/Istanbul takvim ayıdır
 * (UTC+3 sabit, lib/domain/crm/appointment.ts). Testler overview.test.ts'te.
 */
import { msToIstanbul } from "@/lib/domain/crm/appointment";
import { computeNps } from "./logic";

export interface NpsMonth {
  /** YYYY-MM (İstanbul). */
  month: string;
  /** Aydaki geçerli NPS puanlarından −100…+100; puan yoksa null. */
  nps: number | null;
  /** Aydaki NPS yanıtı sayısı. */
  count: number;
}

/** Genel özetin kapsadığı gün sayısı. */
export const NPS_OVERVIEW_DAYS = 90;
/** Eğilimdeki ay sayısı (bu ay dahil). */
export const NPS_TREND_MONTHS = 6;

const monthOf = (ms: number): string => msToIstanbul(ms).date.slice(0, 7);

/** Bu ay dahil son `months` ayın YYYY-MM listesi (eskiden yeniye). */
export function lastMonths(now: number, months = NPS_TREND_MONTHS): string[] {
  const [y, m] = monthOf(now).split("-").map(Number);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** İlk ayın ilk gününün İstanbul gece yarısı (epoch ms) — yanıtları bu tarihten itibaren okumak için. */
export function trendStartMs(now: number, months = NPS_TREND_MONTHS): number {
  const [y, m] = lastMonths(now, months)[0].split("-").map(Number);
  return Date.UTC(y, m - 1, 1) - 3 * 60 * 60 * 1000;
}

/** Aylık NPS: pencere dışındaki yanıtlar sayılmaz; yanıtı olmayan ay `nps: null, count: 0` olarak yine listelenir. */
export function npsByMonth(
  responses: ReadonlyArray<{ nps: number | null; createdAt: number }>,
  now: number,
  months = NPS_TREND_MONTHS
): NpsMonth[] {
  const keys = lastMonths(now, months);
  const scores = new Map<string, number[]>(keys.map((k) => [k, []]));
  for (const r of responses) {
    if (r.nps == null) continue;
    scores.get(monthOf(r.createdAt))?.push(r.nps);
  }
  return keys.map((month) => {
    const list = scores.get(month) ?? [];
    return { month, nps: computeNps(list), count: list.length };
  });
}
