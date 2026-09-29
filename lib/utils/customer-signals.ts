/**
 * Müşteri sinyalleri için ortak gün hesapları (kalan gün, hareketsiz gün, rozet seviyesi).
 * Tarihler epoch ms, ISO string ya da Date olabilir; boş/geçersiz girdi null döner.
 * Günler takvim günüdür (yerel saatle gün başları arasındaki fark).
 */

export type DateInput = Date | string | number | null | undefined;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Bugünden hedef tarihe kaç gün var (geçmişse negatif). Ör. yarın → 1, bugün → 0. */
export function daysUntil(date: DateInput, now: Date = new Date()): number | null {
  const d = toDate(date);
  if (!d) return null;
  // Math.round: yaz saati geçişlerinde 23/25 saatlik günleri düzeltir.
  return Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
}

/** Tarihten bu yana kaç gün geçti (gelecekse negatif). Ör. dün → 1. */
export function daysSince(date: DateInput, now: Date = new Date()): number | null {
  const n = daysUntil(date, now);
  return n == null ? null : -n;
}

export const INACTIVITY_THRESHOLDS = { active: 7, slowing: 14, inactive: 30 } as const;

export type InactivityLevel = "aktif" | "yavaşladı" | "hareketsiz";

/** 0–7 gün aktif, 8–30 gün yavaşladı, 30+ gün ya da hiç hareket yoksa (null) hareketsiz. */
export function inactivityLevel(days: number | null | undefined): InactivityLevel {
  if (days == null || days > INACTIVITY_THRESHOLDS.inactive) return "hareketsiz";
  if (days <= INACTIVITY_THRESHOLDS.active) return "aktif";
  return "yavaşladı";
}

export type InactivityTone = "green" | "yellow" | "orange" | "red" | "gray";

/** Rozet rengi: 0–7 yeşil, 8–14 sarı, 15–30 turuncu, 30+ kırmızı, hiç yok gri. */
export function inactivityTone(days: number | null | undefined): InactivityTone {
  if (days == null) return "gray";
  if (days <= INACTIVITY_THRESHOLDS.active) return "green";
  if (days <= INACTIVITY_THRESHOLDS.slowing) return "yellow";
  if (days <= INACTIVITY_THRESHOLDS.inactive) return "orange";
  return "red";
}

/** "bugün", "dün", "3 gün önce", "2 ay sonra"… Dil parametreyle değişir (varsayılan tr). */
export function formatRelativeTr(date: DateInput, now: Date = new Date(), locale = "tr"): string {
  const days = daysUntil(date, now);
  if (days == null) return "—";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(days);
  if (abs < 45) return rtf.format(days, "day");
  if (abs < 365) return rtf.format(Math.round(days / 30), "month");
  return rtf.format(Math.round(days / 365), "year");
}
