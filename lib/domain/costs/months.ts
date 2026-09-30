/** Ay anahtarı ("YYYY-MM") yardımcıları — saf, saat dilimi bağımsız (tarihler Europe/Istanbul gününe göre `todayIso` ile gelir). */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string | null | undefined): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

/** "2026-09-15" → "2026-09". */
export function monthOfDay(iso: string): string {
  return iso.slice(0, 7);
}

/** "2026-09" → "2026-09-01" (veritabanındaki period_month). */
export function monthStartDay(month: string): string {
  return `${month}-01`;
}

/** Ayı k ay ileri / geri kaydırır. */
export function addMonthsKey(month: string, k: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + k;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Son `n` ay, eskiden yeniye; sonuncusu `month`. */
export function monthsEndingAt(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonthsKey(month, -(n - 1 - i)));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Bugünün ayın kaçında olduğu (1–31). */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Ay içinde geçen oran (0–1]: bugün / ayın gün sayısı. */
export function elapsedFraction(todayDay: string): number {
  return dayOfMonth(todayDay) / daysInMonth(monthOfDay(todayDay));
}

/** Ekranda "Eylül 2026". */
export function monthLabel(month: string, locale = "tr-TR", style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: style,
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  });
}
