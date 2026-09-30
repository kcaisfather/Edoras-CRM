/**
 * Rapor zamanlaması — saf fonksiyonlar (testler schedule.test.ts). DeepSport'ta İstanbul sabit UTC+3 sayılırdı;
 * burada zaman dilimi kuralı `Intl` ile okunur: yaz saati uygulayan bir bölgede de (testte America/New_York) "08:30"
 * duvar saati doğru anı verir, uygulamayan İstanbul'da sonuç sabit +03:00'a eşittir.
 */
import { REPORT_TIMEZONE, type ReportFrequency } from "./types";

/** "HH:MM" → gün içi dakika; geçersizse null (SQL: crm_report_subscriptions_time_check ile aynı kural). */
export function parseTime(value: string): number | null {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Anın duvar saati (y, ay 0–11, gün, saat, dakika, saniye) verilen zaman diliminde. */
function wallClock(tz: string, epoch: number) {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(epoch))) if (p.type !== "literal") out[p.type] = Number(p.value);
  return { y: out.year, m: out.month - 1, d: out.day, h: out.hour, min: out.minute, s: out.second };
}

/** Zaman diliminin o andaki UTC farkı (ms). */
function offsetMs(tz: string, epoch: number): number {
  const w = wallClock(tz, epoch);
  return Date.UTC(w.y, w.m, w.d, w.h, w.min, w.s) - Math.floor(epoch / 1000) * 1000;
}

/** Duvar saatini (y, ay 0–11, gün — taşan gün/ay normalleşir —, gün içi dakika) UTC epoch ms'e çevirir. */
function zonedToEpoch(tz: string, y: number, m: number, d: number, minutes: number): number {
  const naive = Date.UTC(y, m, d, 0, minutes);
  let t = naive - offsetMs(tz, naive);
  // İkinci geçiş: farkı bulunan andaki kurala göre düzeltir (yaz saati geçişine denk gelen saatlerde).
  t = naive - offsetMs(tz, t);
  return t;
}

export interface ScheduleConfig {
  frequency: ReportFrequency;
  time: string;
  /** Haftalık: 1 = Pazartesi … 7 = Pazar. */
  weekday?: number | null;
  /** Aylık: 1–28. */
  dayOfMonth?: number | null;
}

/**
 * `now` anından KESİN sonra olan ilk gönderim anı (epoch ms); yapılandırma geçersizse null.
 * Aynı anda çalışan ikinci hesap (dağıtıcı `next_run_at`'i yeniler) `now`'ı kaydırdığı için bir çalışma iki kez üretilmez.
 */
export function nextRunAt(cfg: ScheduleConfig, now: Date = new Date(), tz: string = REPORT_TIMEZONE): number | null {
  const minutes = parseTime(cfg.time);
  if (minutes == null) return null;
  const today = wallClock(tz, now.getTime());
  const { y, m, d } = today;
  const after = (at: number) => at > now.getTime();

  if (cfg.frequency === "DAILY") {
    for (let i = 0; i <= 1; i++) {
      const at = zonedToEpoch(tz, y, m, d + i, minutes);
      if (after(at)) return at;
    }
    return null;
  }

  if (cfg.frequency === "WEEKLY") {
    const weekday = cfg.weekday ?? 0;
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
    const todayIso = ((new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7) + 1; // 1 = Pzt
    for (let i = 0; i <= 7; i++) {
      if (((todayIso - 1 + i) % 7) + 1 !== weekday) continue;
      const at = zonedToEpoch(tz, y, m, d + i, minutes);
      if (after(at)) return at;
    }
    return null;
  }

  const day = cfg.dayOfMonth ?? 0;
  if (!Number.isInteger(day) || day < 1 || day > 28) return null;
  for (let i = 0; i <= 1; i++) {
    const at = zonedToEpoch(tz, y, m + i, day, minutes);
    if (after(at)) return at;
  }
  return null;
}
