import { describe, expect, it } from "vitest";
import { nextRunAt, parseTime } from "./schedule";

// 2026-09-26 Cumartesi 10:00 İstanbul = 07:00 UTC
const NOW = new Date(Date.UTC(2026, 8, 26, 7, 0));
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const cfg = (over: Partial<Parameters<typeof nextRunAt>[0]>) => ({ frequency: "DAILY" as const, time: "08:30", weekday: null, dayOfMonth: null, ...over });

describe("parseTime", () => {
  it("HH:MM kabul eder", () => {
    expect(parseTime("08:30")).toBe(510);
    expect(parseTime("00:05")).toBe(5);
    expect(parseTime("23:59")).toBe(1439);
  });
  it("geçersizi reddeder (SQL time_check ile aynı kural)", () => {
    for (const v of ["24:00", "12:60", "abc", "8:30", "08:30:00", " 08:30", ""]) expect(parseTime(v)).toBeNull();
  });
});

describe("nextRunAt (Europe/Istanbul, UTC+3)", () => {
  it("günlük: bugün henüz gelmediyse bugün", () => {
    expect(iso(nextRunAt(cfg({ time: "18:00" }), NOW))).toBe("2026-09-26T15:00:00.000Z");
  });
  it("günlük: saat geçtiyse yarın", () => {
    expect(iso(nextRunAt(cfg({ time: "08:30" }), NOW))).toBe("2026-09-27T05:30:00.000Z");
  });
  it("günlük: tam çalışma anında bir sonrakine geçer (kesin sonra)", () => {
    const at = Date.UTC(2026, 8, 27, 5, 30);
    expect(iso(nextRunAt(cfg({ time: "08:30" }), new Date(at)))).toBe("2026-09-28T05:30:00.000Z");
    expect(iso(nextRunAt(cfg({ time: "08:30" }), new Date(at - 1)))).toBe("2026-09-27T05:30:00.000Z");
  });
  it("günlük: gece yarısına yakın İstanbul gününü kullanır, UTC gününü değil", () => {
    // 2026-09-26 22:30 UTC = 27 Eylül 01:30 İstanbul → 08:30 aynı İstanbul günü
    expect(iso(nextRunAt(cfg({ time: "08:30" }), new Date(Date.UTC(2026, 8, 26, 22, 30))))).toBe("2026-09-27T05:30:00.000Z");
  });
  it("haftalık: pazartesi", () => {
    expect(iso(nextRunAt(cfg({ frequency: "WEEKLY", weekday: 1, time: "09:00" }), NOW))).toBe("2026-09-28T06:00:00.000Z");
  });
  it("haftalık: aynı gün sonra / aynı gün geçti → gelecek hafta; pazar 7", () => {
    expect(iso(nextRunAt(cfg({ frequency: "WEEKLY", weekday: 6, time: "11:00" }), NOW))).toBe("2026-09-26T08:00:00.000Z");
    expect(iso(nextRunAt(cfg({ frequency: "WEEKLY", weekday: 6, time: "09:00" }), NOW))).toBe("2026-10-03T06:00:00.000Z");
    expect(iso(nextRunAt(cfg({ frequency: "WEEKLY", weekday: 7, time: "09:00" }), NOW))).toBe("2026-09-27T06:00:00.000Z");
  });
  it("aylık: ayın 1'i → gelecek ay; aralık yıl atlar; ayın 28'i", () => {
    expect(iso(nextRunAt(cfg({ frequency: "MONTHLY", dayOfMonth: 1, time: "09:00" }), NOW))).toBe("2026-10-01T06:00:00.000Z");
    const dec = new Date(Date.UTC(2026, 11, 20, 7, 0));
    expect(iso(nextRunAt(cfg({ frequency: "MONTHLY", dayOfMonth: 5, time: "09:00" }), dec))).toBe("2027-01-05T06:00:00.000Z");
    expect(iso(nextRunAt(cfg({ frequency: "MONTHLY", dayOfMonth: 28, time: "09:00" }), NOW))).toBe("2026-09-28T06:00:00.000Z");
  });
  it("aylık: ayın son günü geçmişken gelecek ay (şubat 28)", () => {
    const feb = new Date(Date.UTC(2027, 1, 28, 20, 0));
    expect(iso(nextRunAt(cfg({ frequency: "MONTHLY", dayOfMonth: 28, time: "09:00" }), feb))).toBe("2027-03-28T06:00:00.000Z");
  });
  it("geçersiz yapılandırma → null", () => {
    expect(nextRunAt(cfg({ time: "x" }), NOW)).toBeNull();
    expect(nextRunAt(cfg({ frequency: "WEEKLY", weekday: null }), NOW)).toBeNull();
    expect(nextRunAt(cfg({ frequency: "WEEKLY", weekday: 8 }), NOW)).toBeNull();
    expect(nextRunAt(cfg({ frequency: "MONTHLY", dayOfMonth: 29 }), NOW)).toBeNull();
    expect(nextRunAt(cfg({ frequency: "MONTHLY", dayOfMonth: null }), NOW)).toBeNull();
  });
});

describe("nextRunAt yaz saati (DST) güvenli", () => {
  const NY = "America/New_York";
  it("yaz saati başlarken (8 Mart 2026) duvar saati korunur: 09:00 → EDT (UTC-4)", () => {
    // 7 Mart 2026 12:00 EST = 17:00 UTC; bir sonraki günlük 09:00 yerel = 8 Mart 09:00 EDT = 13:00 UTC.
    expect(iso(nextRunAt(cfg({ time: "09:00" }), new Date(Date.UTC(2026, 2, 7, 17, 0)), NY))).toBe("2026-03-08T13:00:00.000Z");
    // Değişimden bir gün önceki 09:00 EST = 14:00 UTC.
    expect(iso(nextRunAt(cfg({ time: "09:00" }), new Date(Date.UTC(2026, 2, 6, 17, 0)), NY))).toBe("2026-03-07T14:00:00.000Z");
  });
  it("yaz saati biterken (1 Kasım 2026) 09:00 → EST (UTC-5)", () => {
    expect(iso(nextRunAt(cfg({ time: "09:00" }), new Date(Date.UTC(2026, 10, 1, 16, 0)), NY))).toBe("2026-11-02T14:00:00.000Z");
    expect(iso(nextRunAt(cfg({ time: "09:00" }), new Date(Date.UTC(2026, 9, 31, 16, 0)), NY))).toBe("2026-11-01T14:00:00.000Z");
  });
  it("haftalık ve aylık da yerel saate göre", () => {
    // Pazar 8 Mart 2026 (yaz saati başlıyor) 09:00 haftalık → EDT.
    expect(iso(nextRunAt(cfg({ frequency: "WEEKLY", weekday: 7, time: "09:00" }), new Date(Date.UTC(2026, 2, 3, 12, 0)), NY))).toBe("2026-03-08T13:00:00.000Z");
    expect(iso(nextRunAt(cfg({ frequency: "MONTHLY", dayOfMonth: 15, time: "09:00" }), new Date(Date.UTC(2026, 2, 20, 12, 0)), NY))).toBe("2026-04-15T13:00:00.000Z");
  });
  it("İstanbul yıl boyunca sabit +03:00", () => {
    expect(iso(nextRunAt(cfg({ time: "08:30" }), new Date(Date.UTC(2026, 0, 10, 0, 0))))).toBe("2026-01-10T05:30:00.000Z");
    expect(iso(nextRunAt(cfg({ time: "08:30" }), new Date(Date.UTC(2026, 6, 10, 0, 0))))).toBe("2026-07-10T05:30:00.000Z");
  });
});
