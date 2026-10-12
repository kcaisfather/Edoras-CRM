/**
 * Demo süresi — kurum bazlı (kurucu kararı 2026-10-12: "demo süresi kurum bazlı değişebilsin, sistemde sabit bir şey
 * olmasın"). Saf fonksiyonlar.
 *
 * - Süre her demo açılışında SEÇİLİR: hızlı seçimler (14 gün / 1 ay / 3 ay / 1 yıl) yalnız bitiş tarihini hesaplar ya da
 *   özel bitiş tarihi girilir. Hazır / varsayılan süre YOK: formda hiçbir seçim önceden işaretli değildir, sunucu ve
 *   veritabanı (CRM_DEMO_END_REQUIRED) bitişsiz demoyu reddeder.
 * - Açık demonun bitişini sonradan yalnız ADMIN değiştirir (uzatma ya da kısaltma; PATCH /api/institutions/{id}/demo).
 * - Kural (SQL crm_institutions_demo_dates_check, 20261012120000): bitiş > başlangıç. Aralık [başlangıç, bitiş): bitiş
 *   günü demo bitmiştir. Ücretli lisans bundan bağımsız, yine 1 dönem = 1 yıl (rules.ts TERM_YEARS).
 */
import { addDays, addMonths, daysBetween, isIsoDate } from "./rules";

/** Hızlı seçimler (formda bu sırayla; ardından "Özel tarih"). */
export const DEMO_DURATION_CHOICES = ["14d", "1m", "3m", "1y"] as const;
export type DemoDurationChoice = (typeof DEMO_DURATION_CHOICES)[number];

const SPANS: Record<DemoDurationChoice, { days: number } | { months: number }> = {
  "14d": { days: 14 },
  "1m": { months: 1 },
  "3m": { months: 3 },
  "1y": { months: 12 },
};

/**
 * Hızlı seçimin bitişi. Ay eklemede ay sonunu aşan gün ayın son gününe kırpılır (Postgres `date + interval` ile aynı:
 * 31 Ocak + 1 ay = 28 Şubat; 29 Şubat + 1 yıl = 28 Şubat).
 */
export function demoEndFor(startsOn: string, choice: DemoDurationChoice): string {
  const span = SPANS[choice];
  return "days" in span ? addDays(startsOn, span.days) : addMonths(startsOn, span.months);
}

/** Bitiş, başlangıca göre hangi hızlı seçime denk geliyor (yoksa null → "Özel tarih"). */
export function matchDemoChoice(startsOn: string, endsOn: string | null | undefined): DemoDurationChoice | null {
  if (!isIsoDate(startsOn) || !isIsoDate(endsOn)) return null;
  return DEMO_DURATION_CHOICES.find((c) => demoEndFor(startsOn, c) === endsOn) ?? null;
}

/** Geçerli demo bitişi: tarih ve başlangıçtan sonra (SQL crm_institutions_demo_dates_check). */
export function isValidDemoEnd(startsOn: string, endsOn: string | null | undefined): endsOn is string {
  return isIsoDate(startsOn) && isIsoDate(endsOn) && endsOn > startsOn;
}

/** Demonun uzunluğu (gün). */
export function demoLengthDays(startsOn: string, endsOn: string): number {
  return daysBetween(startsOn, endsOn);
}

/**
 * Satışla açılan hesabın TEKNİK demo bitişi: başlangıç + 1 gün. Satış yolu (lib/server/crm-leads.ts recordLeadSale →
 * NEW / ENROLL) kurumu önce DEMO olarak kayda alır, aynı işlem zincirinde crm_record_lead_sale ücretliye geçirir (RPC
 * kurumun CRM kaydını şart koşar). Kısıt DEMO satırında bitiş > başlangıç istediği için en kısa geçerli değer verilir;
 * kayıt ücretliye geçtiği için bu tarihler yalnız geçmiş olarak kalır, hiçbir ekranda demo süresi olarak görünmez
 * (demo kartı / kalan gün yalnız status = DEMO'da). Kuruma verilmiş bir demo süresi DEĞİLDİR.
 */
export function saleDemoEndDate(startsOn: string): string {
  return addDays(startsOn, 1);
}
