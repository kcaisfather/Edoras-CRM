import { describe, expect, it } from "vitest";
import { buildOverview, buildServicesMatrix, forecastService, forecastTotal, serviceShares, totalsByMonth, type LedgerLine } from "./aggregate";
import { addMonthsKey, daysInMonth, elapsedFraction, monthsEndingAt } from "./months";

const line = (service: LedgerLine["service"], month: string, amountTry: number): LedgerLine => ({ service, month, amountTry });

describe("ay yardımcıları", () => {
  it("ay kaydırma yıl sınırını geçer", () => {
    expect(addMonthsKey("2026-01", -1)).toBe("2025-12");
    expect(addMonthsKey("2026-11", 3)).toBe("2027-02");
    expect(monthsEndingAt("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("ayın gün sayısı ve geçen oran", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(elapsedFraction("2026-09-15")).toBe(0.5);
  });
});

describe("forecastService", () => {
  it("sabit kalem: max(girilen, geçen ay) — hızla büyütülmez", () => {
    expect(forecastService("SUPABASE", 1000, 1000, "2026-09-02")).toBe(1000);
    expect(forecastService("VERCEL", 0, 800, "2026-09-02")).toBe(800);
    expect(forecastService("DOMAIN", 900, 800, "2026-09-20")).toBe(900);
  });
  it("kullanıma bağlı: ayın 5'inden sonra hızla", () => {
    expect(forecastService("SMS", 500, 300, "2026-09-15")).toBe(1000);
    expect(forecastService("OPENAI", 100, 0, "2026-09-10")).toBe(300);
  });
  it("kullanıma bağlı: ayın ilk günlerinde ya da girilmemişse girilen ile geçen ayın büyüğü", () => {
    expect(forecastService("SMS", 50, 300, "2026-09-03")).toBe(300);
    expect(forecastService("SMS", 0, 300, "2026-09-25")).toBe(300);
    expect(forecastService("SMS", 0, 0, "2026-09-25")).toBe(0);
  });
});

describe("genel bakış", () => {
  const lines = [
    line("SUPABASE", "2026-08", 1000),
    line("SMS", "2026-08", 400),
    line("SUPABASE", "2026-09", 1000),
    line("SMS", "2026-09", 300),
    line("OPENAI", "2026-09", 200),
  ];
  it("ay toplamı, geçen ay, tahmin ve değişim", () => {
    const o = buildOverview(lines, "2026-09-15");
    expect(o.month).toBe("2026-09");
    expect(o.monthToDateTry).toBe(1500);
    expect(o.previousMonthTry).toBe(1400);
    // Supabase sabit 1000 + SMS 300/0.5 = 600 + OpenAI 200/0.5 = 400
    expect(o.forecastTry).toBe(2000);
    expect(o.monthOverMonthPct).toBeCloseTo(((2000 - 1400) / 1400) * 100);
    expect(o.hasEntries).toBe(true);
    expect(o.trend).toHaveLength(12);
    expect(o.trend[11]).toMatchObject({ month: "2026-09", totalTry: 1500 });
    expect(o.trend[10]).toMatchObject({ month: "2026-08", totalTry: 1400 });
    expect(o.trend[0].totalTry).toBe(0);
  });
  it("hizmet payları büyükten küçüğe, toplam %100", () => {
    const shares = serviceShares(totalsByMonth(lines), "2026-09");
    expect(shares.map((s) => s.service)).toEqual(["SUPABASE", "SMS", "OPENAI"]);
    expect(shares.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(100);
  });
  it("defter boşken sıfır ve değişim yok", () => {
    const o = buildOverview([], "2026-09-15");
    expect(o).toMatchObject({ monthToDateTry: 0, forecastTry: 0, previousMonthTry: 0, monthOverMonthPct: null, hasEntries: false });
  });
  it("aynı hizmet ve ay için çok satır toplanır (kuruş yuvarlı)", () => {
    const totals = totalsByMonth([line("VERCEL", "2026-09", 100.1), line("VERCEL", "2026-09", 200.2)]);
    expect(totals.get("2026-09")?.VERCEL).toBe(300.3);
    expect(forecastTotal(totals, "2026-09-30")).toBe(300.3);
  });
});

describe("hizmet × ay matrisi", () => {
  it("yalnız tutarı olan hizmetler; satır ve sütun toplamları", () => {
    const m = buildServicesMatrix([line("SMS", "2026-08", 10), line("SMS", "2026-09", 20), line("VERCEL", "2026-09", 5)], ["2026-08", "2026-09"]);
    expect(m.rows.map((r) => r.service)).toEqual(["VERCEL", "SMS"]);
    expect(m.rows.find((r) => r.service === "SMS")).toMatchObject({ byMonth: [10, 20], totalTry: 30 });
    expect(m.totalsByMonth).toEqual([10, 25]);
    expect(m.grandTotalTry).toBe(35);
  });
});
