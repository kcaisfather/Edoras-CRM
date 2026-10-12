import { describe, expect, it } from "vitest";
import {
  DEMO_DURATION_CHOICES,
  demoEndFor,
  demoLengthDays,
  isValidDemoEnd,
  matchDemoChoice,
  saleDemoEndDate,
} from "./demo-duration";

describe("demo süresi hızlı seçimleri", () => {
  it("14 gün, 1 ay, 3 ay, 1 yıl — bu sırayla", () => {
    expect(DEMO_DURATION_CHOICES).toEqual(["14d", "1m", "3m", "1y"]);
    expect(DEMO_DURATION_CHOICES.map((c) => demoEndFor("2026-10-12", c))).toEqual([
      "2026-10-26",
      "2026-11-12",
      "2027-01-12",
      "2027-10-12",
    ]);
  });

  it("ay sonu kırpılır (Postgres ile aynı); 14 gün ay / yıl taşar", () => {
    expect(demoEndFor("2026-01-31", "1m")).toBe("2026-02-28");
    expect(demoEndFor("2026-11-30", "3m")).toBe("2027-02-28");
    expect(demoEndFor("2028-02-29", "1y")).toBe("2029-02-28");
    expect(demoEndFor("2026-12-25", "14d")).toBe("2027-01-08");
  });

  it("bitişin hangi seçime denk geldiği; denk gelmeyen özel tarihtir", () => {
    expect(matchDemoChoice("2026-10-12", "2026-10-26")).toBe("14d");
    expect(matchDemoChoice("2026-10-12", "2027-01-12")).toBe("3m");
    expect(matchDemoChoice("2026-10-12", "2026-12-31")).toBeNull();
    expect(matchDemoChoice("2026-10-12", "")).toBeNull();
    expect(matchDemoChoice("", "2026-10-26")).toBeNull();
  });
});

describe("demo bitişi kuralı (SQL crm_institutions_demo_dates_check)", () => {
  it("bitiş geçerli tarih ve başlangıçtan sonra olmalı; en kısa demo 1 gün", () => {
    expect(isValidDemoEnd("2026-10-12", "2026-10-13")).toBe(true);
    expect(isValidDemoEnd("2026-10-12", "2026-10-12")).toBe(false);
    expect(isValidDemoEnd("2026-10-12", "2026-10-01")).toBe(false);
    expect(isValidDemoEnd("2026-10-12", "2026-02-30")).toBe(false);
    expect(isValidDemoEnd("2026-10-12", "")).toBe(false);
    expect(isValidDemoEnd("2026-10-12", null)).toBe(false);
  });

  it("uzunluk gün olarak", () => {
    expect(demoLengthDays("2026-10-12", "2026-10-26")).toBe(14);
    expect(demoLengthDays("2026-10-12", "2027-10-12")).toBe(365);
  });

  it("satış yolunun teknik demo bitişi başlangıç + 1 gün (kurala uyan en kısa değer)", () => {
    expect(saleDemoEndDate("2026-12-31")).toBe("2027-01-01");
    expect(isValidDemoEnd("2026-12-31", saleDemoEndDate("2026-12-31"))).toBe(true);
  });
});
