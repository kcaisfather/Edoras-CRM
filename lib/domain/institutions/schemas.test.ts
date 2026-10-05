import { describe, expect, it } from "vitest";
import {
  billingCoreSchema,
  billingProfileFormValues,
  billingSchema,
  toBillingProfile,
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
    const v = billingCoreSchema.parse({ address: ADDRESS, idType: "TC", idNumber: "100 000 001 46" });
    expect(toBilling(v)).toEqual({ address: ADDRESS, tcNo: "10000000146", taxNo: null });
  });

  it("adres ya da geçerli numara yoksa reddedilir", () => {
    expect(issues(billingCoreSchema.safeParse({ address: "", idType: "TC", idNumber: "10000000146" }))).toEqual(["address"]);
    expect(issues(billingCoreSchema.safeParse({ address: ADDRESS, idType: "TC", idNumber: "" }))).toEqual(["idNumber"]);
    expect(issues(billingCoreSchema.safeParse({ address: ADDRESS, idType: "VKN", idNumber: "10000000147" }))).toEqual([
      "idNumber",
    ]);
    // Şahıs şirketi: kurumsalda geçerli TCKN vergi numarası olarak kabul edilir.
    expect(issues(billingCoreSchema.safeParse({ address: ADDRESS, idType: "VKN", idNumber: "10000000146" }))).toEqual([]);
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

describe("fatura profili (genişletilmiş billingSchema)", () => {
  const person = {
    address: ADDRESS,
    idType: "TC" as const,
    idNumber: "10000000146",
    legalName: "Ayşe Yılmaz",
    taxOffice: "",
    city: "İstanbul",
    district: "Bakırköy",
    postalCode: "",
    email: "Fatura@Kurum.com",
  };
  const company = { ...person, idType: "VKN" as const, idNumber: "9876543217", legalName: "Deneme Koleji A.Ş.", taxOffice: "Kadıköy" };

  it("bireysel: tür TC'den türetilir, vergi dairesi yazılmaz, e-posta küçük harf", () => {
    const v = billingSchema.parse(person);
    expect(toBillingProfile(v)).toEqual({
      address: ADDRESS,
      tcNo: "10000000146",
      taxNo: null,
      billingType: "INDIVIDUAL",
      legalName: "Ayşe Yılmaz",
      taxOffice: null,
      city: "İstanbul",
      district: "Bakırköy",
      postalCode: null,
      email: "fatura@kurum.com",
    });
  });

  it("kurumsal: Vergi No + vergi dairesi zorunlu", () => {
    const v = billingSchema.parse(company);
    expect(toBillingProfile(v)).toMatchObject({ billingType: "COMPANY", tcNo: null, taxNo: "9876543217", taxOffice: "Kadıköy" });
    expect(issues(billingSchema.safeParse({ ...company, taxOffice: "" }))).toEqual(["taxOffice"]);
  });

  it("kurumsalda şahıs şirketinin TCKN'si vergi numarası olarak kabul edilir", () => {
    const v = billingSchema.parse({ ...company, idNumber: "10000000146" });
    expect(toBillingProfile(v)).toMatchObject({ billingType: "COMPANY", tcNo: null, taxNo: "10000000146", taxOffice: "Kadıköy" });
    expect(issues(billingSchema.safeParse({ ...company, idNumber: "10000000147" }))).toEqual(["idNumber"]);
  });

  it("bireyselde VKN kabul edilmez (VKN kurumsal türüdür)", () => {
    expect(issues(billingSchema.safeParse({ ...person, idNumber: "9876543217" }))).toEqual(["idNumber"]);
  });

  it("bireyselde bırakılan vergi dairesi yok sayılır (SQL: vergi dairesi yalnız VKN ile)", () => {
    expect(toBillingProfile(billingSchema.parse({ ...person, taxOffice: "Kadıköy" })).taxOffice).toBeNull();
  });

  it.each([
    ["legalName", ""],
    ["city", " "],
    ["district", ""],
    ["email", "yok"],
    ["postalCode", "3400"],
  ])("%s eksik ya da geçersizse reddedilir", (field, value) => {
    expect(issues(billingSchema.safeParse({ ...person, [field]: value }))).toEqual([field]);
  });

  it("posta kodu 5 hane ya da boş", () => {
    expect(toBillingProfile(billingSchema.parse({ ...person, postalCode: "34158" })).postalCode).toBe("34158");
  });

  it("form başlangıcı: eski kayıtta tür kimlikten çıkar, kayıt yoksa varsayılanlar kullanılır", () => {
    const legacy = {
      address: ADDRESS, tcNo: null, taxNo: "9876543217", billingType: null, legalName: null, taxOffice: null,
      city: null, district: null, postalCode: null, email: null, eInvoiceRegistered: null,
    };
    expect(billingProfileFormValues(legacy, { legalName: "Kurum", email: "a@b.co" })).toMatchObject({
      idType: "VKN", idNumber: "9876543217", legalName: "Kurum", email: "a@b.co",
    });
    expect(billingProfileFormValues(null, { legalName: "Kurum" })).toMatchObject({ idType: "TC", idNumber: "", legalName: "Kurum" });
  });
});
