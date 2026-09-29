import { describe, expect, it } from "vitest";
import {
  daysSince,
  daysUntil,
  formatRelativeTr,
  inactivityLevel,
  inactivityTone,
} from "./customer-signals";

const now = new Date(2026, 8, 26, 10, 30); // 26 Eylül 2026, 10:30 yerel

describe("daysUntil / daysSince", () => {
  it("takvim günü sayar, saatten etkilenmez", () => {
    expect(daysUntil(new Date(2026, 8, 26, 23, 59), now)).toBe(0);
    expect(daysUntil(new Date(2026, 8, 27, 0, 1), now)).toBe(1);
    expect(daysUntil(new Date(2026, 8, 19, 12), now)).toBe(-7);
    expect(daysSince(new Date(2026, 8, 19, 12), now)).toBe(7);
  });

  it("epoch ms ve ISO string kabul eder", () => {
    expect(daysUntil(new Date(2026, 9, 6).getTime(), now)).toBe(10);
    expect(daysUntil("2026-10-06T12:00:00", now)).toBe(10);
  });

  it("ay sonu / yaz saati geçişlerinde kaymaz", () => {
    expect(daysUntil(new Date(2026, 11, 31), new Date(2026, 0, 1))).toBe(364);
    expect(daysUntil(new Date(2026, 3, 1), new Date(2026, 2, 1))).toBe(31);
  });

  it("boş veya geçersiz girdi null", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil(undefined, now)).toBeNull();
    expect(daysUntil("", now)).toBeNull();
    expect(daysUntil("tarih-degil", now)).toBeNull();
    expect(daysSince(null, now)).toBeNull();
  });
});

describe("inactivityLevel", () => {
  it.each([
    [0, "aktif"],
    [7, "aktif"],
    [8, "yavaşladı"],
    [14, "yavaşladı"],
    [30, "yavaşladı"],
    [31, "hareketsiz"],
    [null, "hareketsiz"],
  ] as const)("%s gün → %s", (days, level) => {
    expect(inactivityLevel(days)).toBe(level);
  });
});

describe("inactivityTone", () => {
  it.each([
    [3, "green"],
    [7, "green"],
    [8, "yellow"],
    [14, "yellow"],
    [15, "orange"],
    [30, "orange"],
    [31, "red"],
    [null, "gray"],
  ] as const)("%s gün → %s", (days, tone) => {
    expect(inactivityTone(days)).toBe(tone);
  });
});

describe("formatRelativeTr", () => {
  it("Türkçe göreli metin", () => {
    expect(formatRelativeTr(new Date(2026, 8, 26), now)).toBe("bugün");
    expect(formatRelativeTr(new Date(2026, 8, 25), now)).toBe("dün");
    expect(formatRelativeTr(new Date(2026, 8, 27), now)).toBe("yarın");
    expect(formatRelativeTr(new Date(2026, 8, 21), now)).toBe("5 gün önce");
    expect(formatRelativeTr(new Date(2026, 10, 25), now)).toBe("2 ay sonra");
    expect(formatRelativeTr(null, now)).toBe("—");
  });

  it("İngilizce locale", () => {
    expect(formatRelativeTr(new Date(2026, 8, 23), now, "en")).toBe("3 days ago");
  });
});
