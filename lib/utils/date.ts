export type DatePeriodParam = "day" | "week" | "month";

/** Takvim günü (YYYY-MM-DD), Europe/Istanbul — sunucunun dönem ve önbellek anahtarıyla aynı gün (UTC değil). */
export function istanbulIsoDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** YYYY-MM-DD'ye gün ekler (takvim aritmetiği, saat dilimine bağlı değil). */
function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Bugün dahil kaç gün: gün 1, hafta 7, ay 30 ("son 7 gün" = bugün + önceki 6 gün). */
export const PERIOD_DAYS: Record<DatePeriodParam, number> = { day: 1, week: 7, month: 30 };

/**
 * Dashboard dönemi → `from`/`to`. Bugün dahil son 1 / 7 / 30 gün, İstanbul takvim günüyle. Sunucunun varsayılan aralığı
 * ve önbellek ısıtması da bu aralık (docs/backend-performans-yanit-2026-10.md 3. tur); eskiden 8 / 31 gün ve UTC günüydü.
 */
export function getDateRangeByPeriod(period: DatePeriodParam, now: Date = new Date()): { from: string; to: string } {
  const to = istanbulIsoDay(now);
  return { from: addIsoDays(to, -(PERIOD_DAYS[period] - 1)), to };
}

export function formatDateRangeLabel(
  period: string,
  startDate: string | null,
  endDate: string | null,
  locale: string
): string {
  try {
    if (period === "custom" && startDate && endDate) {
      const s = new Date(startDate + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });
      const e = new Date(endDate + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
      return `${s} – ${e}`;
    }
    const validPeriod = (period === "day" || period === "week" || period === "month" ? period : "week") as DatePeriodParam;
    const { from, to } = getDateRangeByPeriod(validPeriod);
    const fromD = new Date(from + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short" });
    const toD = new Date(to + "T00:00:00").toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    return `${fromD} – ${toD}`;
  } catch {
    return "";
  }
}

/** Sayfa dönem seçicisinin değeri (URL: ?period=&startDate=&endDate=). "all" = tarih süzgeci yok. */
export type PeriodParam = DatePeriodParam | "custom" | "all";

const PERIOD_VALUES: readonly PeriodParam[] = ["day", "week", "month", "custom", "all"];

export function parsePeriodParam(value: string | null | undefined, fallback: PeriodParam): PeriodParam {
  return (PERIOD_VALUES as readonly string[]).includes(value ?? "") ? (value as PeriodParam) : fallback;
}

/** YYYY-MM-DD → yerel gün başı (ms); geçersizse null. */
function isoDayStart(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const ms = new Date(y, m - 1, d).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Dönem → [from, to] (ms, uçlar dahil, yerel saat). Dashboard'la aynı pencereler: günlük = bugün,
 * haftalık = son 7 gün, aylık = son 30 gün; özel aralıkta bitiş gününün sonuna kadar.
 * "all" ya da eksik/ters özel aralık → null (süzgeç yok).
 */
export function periodToRange(
  period: PeriodParam,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now = new Date()
): { from: number; to: number } | null {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOf = (dayStart: number) => {
    const d = new Date(dayStart);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
  };
  const back = (days: number) => {
    const d = new Date(todayStart);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days).getTime();
  };
  switch (period) {
    case "day":
      return { from: todayStart, to: endOf(todayStart) };
    // Bugün dahil son 7 / 30 gün (dashboard ve sunucu varsayılanıyla aynı; eskiden 8 / 31 gündü).
    case "week":
      return { from: back(6), to: endOf(todayStart) };
    case "month":
      return { from: back(29), to: endOf(todayStart) };
    case "custom": {
      const s = isoDayStart(startDate);
      const e = isoDayStart(endDate);
      if (s == null || e == null || e < s) return null;
      return { from: s, to: endOf(e) };
    }
    default:
      return null;
  }
}
