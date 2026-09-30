import { describe, expect, it } from "vitest";
import { billingProfileCompleteness, effectiveBillingType } from "./billing-profile";

const company = {
  billingType: "COMPANY" as const,
  legalName: "Spor A.Ş.",
  taxNo: "9876543217",
  tcNo: null,
  taxOffice: "Kadıköy",
  address: "Atatürk Cad. No: 1, Kadıköy",
  city: "İstanbul",
  district: "Kadıköy",
  email: "muhasebe@spor.com",
};

describe("effectiveBillingType", () => {
  it("kayıtlı tür; eski kayıtta kimlikten", () => {
    expect(effectiveBillingType({ billingType: "INDIVIDUAL", taxNo: "9876543217" })).toBe("INDIVIDUAL");
    expect(effectiveBillingType({ billingType: null, taxNo: "9876543217" })).toBe("COMPANY");
    expect(effectiveBillingType({ billingType: null, taxNo: null })).toBe("INDIVIDUAL");
    expect(effectiveBillingType(null)).toBe("INDIVIDUAL");
  });
});

describe("billingProfileCompleteness (DeepSport billingCompleteness testleri)", () => {
  it("tam kurumsal profil kabul edilir", () => {
    expect(billingProfileCompleteness(company)).toEqual({ complete: true, missing: [], invalid: [] });
  });

  it("vergi dairesi yalnız kurumsalda gerekir", () => {
    expect(billingProfileCompleteness({ ...company, taxOffice: "" }).missing).toEqual(["taxOffice"]);
    const person = { ...company, billingType: "INDIVIDUAL" as const, taxOffice: "", taxNo: null, tcNo: "10000000146" };
    expect(billingProfileCompleteness(person).complete).toBe(true);
  });

  it("geçersiz numara ve e-posta işaretlenir", () => {
    const r = billingProfileCompleteness({ ...company, taxNo: "1234567891", email: "yok" });
    expect(r.complete).toBe(false);
    expect(r.invalid).toEqual(["taxNumber", "email"]);
  });

  it("eski kayıt (tür null, yalnız adres + kimlik) eksik alanları listeler", () => {
    const legacy = { address: company.address, taxNo: "9876543217", tcNo: null };
    expect(billingProfileCompleteness(legacy)).toEqual({
      complete: false,
      missing: ["legalName", "taxOffice", "city", "district", "email"],
      invalid: [],
    });
  });

  it("kısa adres geçersiz; kayıt yoksa eksik sayılır", () => {
    expect(billingProfileCompleteness({ ...company, address: "Cad. 1" }).invalid).toEqual(["address"]);
    expect(billingProfileCompleteness(null).complete).toBe(false);
  });
});
