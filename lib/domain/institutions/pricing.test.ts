import { describe, expect, it } from "vitest";
import { licensePriceFormValues, parsePercent, priceFromDiscount, resolveLicensePricing } from "./pricing";

describe("parsePercent", () => {
  it("virgül, yüzde işareti ve boşluk kabul edilir; aralık dışı / okunamayan NaN", () => {
    expect(parsePercent("10")).toBe(10);
    expect(parsePercent("12,5")).toBe(12.5);
    expect(parsePercent("%15")).toBe(15);
    expect(parsePercent(" ")).toBeNull();
    expect(parsePercent("101")).toBeNaN();
    expect(parsePercent("-5")).toBeNaN();
    expect(parsePercent("1,234")).toBeNaN();
    expect(parsePercent("abc")).toBeNaN();
  });
});

describe("priceFromDiscount — SQL crm_licenses_discount_check ile aynı yuvarlama", () => {
  it.each([
    [45000, 10, 40500],
    [45000, 0, 45000],
    [45000, 100, 0],
    [29999, 12.5, 26249.13],
    [29950, 33.33, 19967.67],
    [1000.1, 12.35, 876.59],
  ])("liste %s, %%%s → %s", (list, pct, price) => {
    expect(priceFromDiscount(list, pct)).toBe(price);
  });
});

describe("resolveLicensePricing", () => {
  const base = { licenseDiscount: "10", licensePriceManual: false, licensePrice: "" };

  it("yüzde modu: liste fiyatından hesaplar, liste yoksa ya da yüzde geçersizse null", () => {
    expect(resolveLicensePricing(base, 45000)).toEqual({ price: 40500, listPrice: 45000, discountPercent: 10 });
    expect(resolveLicensePricing(base, null)).toBeNull();
    expect(resolveLicensePricing({ ...base, licenseDiscount: "" }, 45000)).toBeNull();
    expect(resolveLicensePricing({ ...base, licenseDiscount: "150" }, 45000)).toBeNull();
  });

  it("elle bedel: liste ve yüzde boş", () => {
    expect(resolveLicensePricing({ ...base, licensePriceManual: true, licensePrice: "29.950" }, 45000)).toEqual({
      price: 29950,
      listPrice: null,
      discountPercent: null,
    });
    expect(resolveLicensePricing({ ...base, licensePriceManual: true, licensePrice: "abc" }, 45000)).toBeNull();
  });
});

describe("licensePriceFormValues", () => {
  it("indirimli lisans yüzdeyle, eski / elle bedelli lisans elle bedelle açılır; yeni form %0", () => {
    expect(licensePriceFormValues({ price: 40500, discountPercent: 10 })).toEqual({ licenseDiscount: "10", licensePriceManual: false, licensePrice: "" });
    expect(licensePriceFormValues({ price: 29950.5, discountPercent: null })).toEqual({ licenseDiscount: "", licensePriceManual: true, licensePrice: "29950,5" });
    expect(licensePriceFormValues(null)).toEqual({ licenseDiscount: "0", licensePriceManual: false, licensePrice: "" });
  });
});
