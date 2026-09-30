/**
 * Haftalık etkinlik serisi (DeepSport "Haftalık büyüme" tablosu / DashboardGrowthTable karşılığı, kurum düzeyi).
 * Sunucu her kurum için haftalık etkinlik sayısını üretir (lib/server/edoras-usage.ts); burada hafta sınırları ve
 * kurum-hafta matrisinden aktif / yeni / kayıp kurum sayıları hesaplanır. Saf; testler weekly.test.ts.
 */
import { addDays, todayIso } from "@/lib/domain/institutions/rules";

export const DEFAULT_WEEKS = 12;
export const MAX_WEEKS = 26;

/** Verilen günün haftasının Pazartesi'si (YYYY-MM-DD). */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Pazar
  return addDays(iso.slice(0, 10), -((dow + 6) % 7));
}

/** Son `n` haftanın başlangıçları, eskiden yeniye; sonuncusu içinde bulunulan (eksik) hafta. */
export function weekStarts(n: number, now = new Date()): string[] {
  const current = weekStart(todayIso(now));
  return Array.from({ length: n }, (_, i) => addDays(current, -7 * (n - 1 - i)));
}

/** Günleri hafta kovalarına dağıtır; serinin dışındaki günler yok sayılır. */
export function bucketByWeek(days: readonly string[], weeks: readonly string[]): number[] {
  const out = new Array<number>(weeks.length).fill(0);
  const index = new Map(weeks.map((w, i) => [w, i]));
  for (const day of days) {
    const i = index.get(weekStart(day));
    if (i != null) out[i] += 1;
  }
  return out;
}

export interface WeeklyRow {
  week: string;
  /** Etkinliği olan kurum sayısı. */
  active: number;
  /** Serinin başından beri ilk kez etkin görünen kurum. */
  newlyActive: number;
  /** Önceki hafta etkin olup bu hafta olmayan. */
  lost: number;
  /** Önceki hafta etkin değilken (ve daha önce etkin olmuşken) geri dönen. */
  returning: number;
  /** Toplam etkinlik. */
  total: number;
}

export function weeklySummary(byInstitution: Record<string, number[]>, weeks: readonly string[]): WeeklyRow[] {
  const series = Object.values(byInstitution);
  const seen = new Array<boolean>(series.length).fill(false);
  return weeks.map((week, w) => {
    let active = 0;
    let newlyActive = 0;
    let lost = 0;
    let returning = 0;
    let total = 0;
    series.forEach((s, i) => {
      const now = s[w] ?? 0;
      const prev = w > 0 ? (s[w - 1] ?? 0) : 0;
      total += now;
      if (now > 0) {
        active += 1;
        if (!seen[i]) newlyActive += 1;
        else if (prev === 0) returning += 1;
        seen[i] = true;
      } else if (prev > 0) lost += 1;
    });
    return { week, active, newlyActive, lost, returning, total };
  });
}
