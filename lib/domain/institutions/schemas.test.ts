import { describe, expect, it } from "vitest";
import {
  billingSchema,
  convertSchema,
  enrollSchema,
  newDemoSchema,
  paymentSchema,
  toBilling,
  toContact,
  type ConvertInput,
} from "./schemas";

const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => i.path.join("."));
}

describe("demo kuralı: ad soyad + kurum adı + telefon + e-posta", () => {
  const ok = {
    institutionName: "Deneme Koleji",
    program: "yks" as const,
    contactName: "Ayşe Yılmaz",
    contactPhone: "0532 123 45 67",
    contactEmail: "Ayse@Kurum.com",
  };

  it("tam bilgiyle geçer ve veritabanı biçimine çevrilir", () => {
    const parsed = newDemoSchema.parse(ok);
    expect(toContact(parsed)).toEqual({
      contactName: "Ayşe Yılmaz",
      contactPhone: "+905321234567",
      contactEmail: "ayse@kurum.com",
    });
  });

  it.each([
    ["institutionName", ""],
    ["contactName", "Ayşe"],
    ["contactPhone", "123"],
    ["contactEmail", "ayse@"],
  ])("%s eksik/geçersizse demo açılmaz", (field, value) => {
    expect(issues(newDemoSchema.safeParse({ ...ok, [field]: value }))).toContain(field);
  });
});

describe("ücretli kuralı: adres + TC veya Vergi No", () => {
  it("TC ile", () => {
    const v = billingSchema.parse({ address: ADDRESS, idType: "TC", idNumber: "100 000 001 46" });
    expect(toBilling(v)).toEqual({ address: ADDRESS, tcNo: "10000000146", taxNo: null });
  });

  it("adres ya da geçerli numara yoksa reddedilir", () => {
    expect(issues(billingSchema.safeParse({ address: "", idType: "TC", idNumber: "10000000146" }))).toEqual(["address"]);
    expect(issues(billingSchema.safeParse({ address: ADDRESS, idType: "TC", idNumber: "" }))).toEqual(["idNumber"]);
    expect(issues(billingSchema.safeParse({ address: ADDRESS, idType: "VKN", idNumber: "10000000146" }))).toEqual([
      "idNumber",
    ]);
  });

  const convert: ConvertInput = {
    address: ADDRESS,
    idType: "TC",
    idNumber: "10000000146",
    licenseStartsOn: "2026-10-01",
    licensePrice: "45.000",
    withPayment: false,
    payAmount: "",
    payMethod: "",
    paidOn: "",
  };

  it("ücretliye geçiş: ödeme isteğe bağlı; seçilirse tutar/yöntem/tarih zorunlu", () => {
    expect(convertSchema.safeParse(convert).success).toBe(true);
    expect(issues(convertSchema.safeParse({ ...convert, withPayment: true })).sort()).toEqual(
      ["paidOn", "payAmount", "payMethod"].sort()
    );
    expect(issues(convertSchema.safeParse({ ...convert, address: "" }))).toContain("address");
    expect(issues(convertSchema.safeParse({ ...convert, licensePrice: "abc" }))).toContain("licensePrice");
  });

  it("kayda alma: DEMO fatura istemez, UCRETLI ister", () => {
    const base = {
      contactName: "Mehmet Kaya",
      contactPhone: "05551112233",
      contactEmail: "mehmet@kurum.com",
      demoStartsOn: "2025-09-15",
      address: "",
      idType: "TC" as const,
      idNumber: "",
      licenseStartsOn: "",
      licensePrice: "",
    };
    expect(enrollSchema.safeParse({ ...base, status: "DEMO" }).success).toBe(true);
    expect(issues(enrollSchema.safeParse({ ...base, status: "DEMO", demoStartsOn: "" }))).toEqual(["demoStartsOn"]);
    expect(issues(enrollSchema.safeParse({ ...base, status: "UCRETLI" })).sort()).toEqual(
      ["address", "idNumber", "licensePrice", "licenseStartsOn"].sort()
    );
  });

  it("ödeme: sıfır tutar reddedilir", () => {
    const r = paymentSchema.safeParse({ payAmount: "0", payMethod: "HAVALE", paidOn: "2026-09-29", licenseId: "", note: "" });
    expect(issues(r)).toEqual(["payAmount"]);
  });
});
