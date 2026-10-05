import { describe, expect, it } from "vitest";
import {
  addDays,
  addYears,
  daysBetween,
  demoEndDate,
  generateTemporaryPassword,
  initialAcademicPeriod,
  isBillingComplete,
  isFullName,
  isIsoDate,
  isValidTckn,
  isValidTaxNumber,
  isValidVkn,
  licenseEndDate,
  renewalStartDate,
  todayIso,
} from "./rules";

describe("TC Kimlik No", () => {
  it("geçerli numarayı kabul eder", () => {
    expect(isValidTckn("10000000146")).toBe(true);
  });
  it.each(["", "1000000014", "100000001460", "00000000146", "10000000145", "1000000014a", null, undefined])(
    "%j geçersiz",
    (v) => {
      expect(isValidTckn(v)).toBe(false);
    }
  );
});

describe("Vergi No", () => {
  it("kontrol hanesi yalnız bir değerde tutar", () => {
    const valid = Array.from({ length: 10 }, (_, c) => `123456789${c}`).filter(isValidVkn);
    expect(valid).toHaveLength(1);
  });
  it.each(["", "123456789", "12345678901", "12345678a0", null])("%j geçersiz", (v) => {
    expect(isValidVkn(v)).toBe(false);
  });
});

describe("ad soyad ve fatura", () => {
  it("ad soyad en az iki kelime", () => {
    expect(isFullName("Ayşe Yılmaz")).toBe(true);
    expect(isFullName("  Ali   Veli Kaya ")).toBe(true);
    expect(isFullName("Ayşe")).toBe(false);
    expect(isFullName("")).toBe(false);
  });

  it("fatura: adres + (TC veya VKN)", () => {
    const address = "Atatürk Cad. No: 12, Bakırköy";
    expect(isBillingComplete({ address, tcNo: "10000000146", taxNo: null })).toBe(true);
    expect(isBillingComplete({ address, tcNo: null, taxNo: null })).toBe(false);
    expect(isBillingComplete({ address: "kısa", tcNo: "10000000146", taxNo: null })).toBe(false);
    expect(isBillingComplete({ address: null, tcNo: "10000000146", taxNo: null })).toBe(false);
  });
});

describe("tarihler", () => {
  it("1 dönem = 1 yıl: lisans da demo da 1 yıl; 29 Şubat 28 Şubat'a kırpılır (Postgres ile aynı)", () => {
    expect(licenseEndDate("2026-10-01")).toBe("2027-10-01");
    expect(demoEndDate("2026-09-29")).toBe("2027-09-29");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });

  it("gün ekleme ve fark", () => {
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(daysBetween("2026-09-29", "2026-10-13")).toBe(14);
    expect(daysBetween("2026-10-13", "2026-09-29")).toBe(-14);
  });

  it("yenileme: süren lisansın bitişinden, bitmişse bugünden", () => {
    expect(renewalStartDate("2027-03-01", "2026-09-29")).toBe("2027-03-01");
    expect(renewalStartDate("2026-01-01", "2026-09-29")).toBe("2026-09-29");
    expect(renewalStartDate(null, "2026-09-29")).toBe("2026-09-29");
  });

  it("bugün Türkiye saatine göre", () => {
    // 28 Eylül 22:30 UTC = 29 Eylül 01:30 İstanbul
    expect(todayIso(new Date("2026-09-28T22:30:00Z"))).toBe("2026-09-29");
  });

  it("ISO tarih doğrulama", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("29.09.2026")).toBe(false);
  });
});

describe("ilk akademik dönem", () => {
  it("Eylül → yeni yılın 1. dönemi", () => {
    expect(initialAcademicPeriod("2026-09-29")).toEqual({
      yearName: "2026-2027",
      yearStart: "2026-09-01",
      yearEnd: "2027-06-30",
      termName: "1. Dönem",
      termStart: "2026-09-01",
      termEnd: "2027-01-31",
    });
  });
  it("Ocak → süren yılın 1. dönemi", () => {
    const p = initialAcademicPeriod("2027-01-10");
    expect([p.yearName, p.termName, p.termEnd]).toEqual(["2026-2027", "1. Dönem", "2027-01-31"]);
  });
  it("Mart → 2. dönem", () => {
    const p = initialAcademicPeriod("2027-03-15");
    expect([p.yearName, p.termName, p.termStart, p.termEnd]).toEqual(["2026-2027", "2. Dönem", "2027-02-01", "2027-06-30"]);
  });
  it("Temmuz → gelecek öğretim yılının 1. dönemi", () => {
    const p = initialAcademicPeriod("2027-07-20");
    expect([p.yearName, p.termStart]).toEqual(["2027-2028", "2027-09-01"]);
  });
});

describe("geçici şifre", () => {
  it("12 karakter, büyük/küçük harf ve rakam içerir, karışan karakter yok", () => {
    let i = 0;
    const seq = [0, 30, 50, 5, 40, 52, 7, 33, 54, 9, 44, 55];
    const pw = generateTemporaryPassword((max) => seq[i++ % seq.length] % max);
    expect(pw).toHaveLength(12);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/\d/);
    expect(pw).not.toMatch(/[0O1lI]/);
  });
});

describe("vergi numarası (VKN ya da şahıs şirketinin TCKN'si)", () => {
  it("10 haneli VKN ve 11 haneli TCKN kabul edilir", () => {
    expect(isValidTaxNumber("9876543217")).toBe(true);
    expect(isValidTaxNumber("10000000146")).toBe(true);
    expect(isValidTaxNumber("10000000147")).toBe(false);
    expect(isValidTaxNumber("")).toBe(false);
  });
});
