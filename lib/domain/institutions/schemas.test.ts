import { describe, expect, it } from "vitest";
import {
  billingCoreSchema,
  billingProfileFormValues,
  billingSchema,
  toBillingProfile,
  convertSchema,
  demoAccountSchema,
  demoEditSchema,
  demoEditSchemaFor,
  enrollSchema,
  licenseEditSchema,
  licenseListPriceSchema,
  newDemoSchema,
  paymentSchema,
  renewSchema,
  toBilling,
  toContact,
  type ConvertInput,
} from "./schemas";
import { addDays, todayIso } from "./rules";

const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => i.path.join("."));
}

describe("demo kuralı: ad soyad + kurum adı + telefon + e-posta + demo süresi", () => {
  const ok = {
    institutionName: "Deneme Koleji",
    program: "yks" as const,
    contactName: "Ayşe Yılmaz",
    contactPhone: "0532 123 45 67",
    contactEmail: "Ayse@Kurum.com",
    demoEndsOn: addDays(todayIso(), 14),
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

  it("demo süresi zorunlu (hazır süre yok); bitiş bugünden sonra olmalı", () => {
    expect(issues(newDemoSchema.safeParse({ ...ok, demoEndsOn: "" }))).toEqual(["demoEndsOn"]);
    expect(issues(newDemoSchema.safeParse({ ...ok, demoEndsOn: todayIso() }))).toEqual(["demoEndsOn"]);
    expect(issues(newDemoSchema.safeParse({ ...ok, demoEndsOn: "2026-02-30" }))).toEqual(["demoEndsOn"]);
    expect(newDemoSchema.safeParse({ ...ok, demoEndsOn: addDays(todayIso(), 1) }).success).toBe(true);
  });

  it("hesap alanları (satışla hesap açma) demo süresi istemez", () => {
    const account = { ...ok, demoEndsOn: undefined };
    expect(demoAccountSchema.safeParse(account).success).toBe(true);
    expect(demoAccountSchema.parse(account)).not.toHaveProperty("demoEndsOn");
  });

  it("açık demonun bitişini değiştirme: geçerli tarih zorunlu (başlangıç sunucuda denetlenir)", () => {
    expect(demoEditSchema.safeParse({ demoEndsOn: "2027-01-15" }).success).toBe(true);
    expect(issues(demoEditSchema.safeParse({ demoEndsOn: "" }))).toEqual(["demoEndsOn"]);
    expect(issues(demoEditSchema.safeParse({ demoEndsOn: "15.01.2027" }))).toEqual(["demoEndsOn"]);
    // Form başlangıcı bilir: kısaltma serbest (geçmişe bile), başlangıçtan önce / aynı gün değil.
    const form = demoEditSchemaFor("2026-09-01");
    expect(form.safeParse({ demoEndsOn: "2026-09-02" }).success).toBe(true);
    expect(issues(form.safeParse({ demoEndsOn: "2026-09-01" }))).toEqual(["demoEndsOn"]);
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
    licenseDiscount: "10",
    licensePriceManual: false,
    licensePrice: "",
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
    expect(issues(convertSchema.safeParse({ ...convert, licenseDiscount: "abc" }))).toContain("licenseDiscount");
    expect(issues(convertSchema.safeParse({ ...convert, licenseDiscount: "101" }))).toContain("licenseDiscount");
  });

  it("lisans bedeli: yüzde modunda elle bedel aranmaz; elle bedelde yüzde aranmaz", () => {
    expect(convertSchema.safeParse({ ...convert, licenseDiscount: "0" }).success).toBe(true);
    const manual = { ...convert, licenseDiscount: "", licensePriceManual: true };
    expect(issues(convertSchema.safeParse(manual))).toEqual(["licensePrice"]);
    expect(convertSchema.safeParse({ ...manual, licensePrice: "29.950" }).success).toBe(true);
    expect(issues(renewSchema.safeParse({ licenseDiscount: "", licensePriceManual: false, licensePrice: "" }))).toEqual(["licenseDiscount"]);
  });

  it("lisans düzeltme ve liste fiyatı", () => {
    const edit = { licenseStartsOn: "2026-09-15", licenseDiscount: "12,5", licensePriceManual: false, licensePrice: "", note: "" };
    expect(licenseEditSchema.safeParse(edit).success).toBe(true);
    expect(issues(licenseEditSchema.safeParse({ ...edit, licenseStartsOn: "" }))).toEqual(["licenseStartsOn"]);
    expect(licenseListPriceSchema.safeParse({ listPrice: "45.000" }).success).toBe(true);
    expect(issues(licenseListPriceSchema.safeParse({ listPrice: "0" }))).toEqual(["listPrice"]);
  });

  it("kayda alma: DEMO fatura istemez, UCRETLI ister", () => {
    const base = {
      contactName: "Mehmet Kaya",
      contactPhone: "05551112233",
      contactEmail: "mehmet@kurum.com",
      demoStartsOn: "2025-09-15",
      demoEndsOn: "2026-09-15",
      address: "",
      idType: "TC" as const,
      idNumber: "",
      licenseStartsOn: "",
      licenseDiscount: "",
      licensePriceManual: false,
      licensePrice: "",
    };
    expect(enrollSchema.safeParse({ ...base, status: "DEMO" }).success).toBe(true);
    expect(issues(enrollSchema.safeParse({ ...base, status: "DEMO", demoStartsOn: "" }))).toEqual(["demoStartsOn"]);
    // Demo süresi seçilmeli; bitiş başlangıçtan sonra olmalı (geçmişte bitmiş eski demo kaydedilebilir).
    expect(issues(enrollSchema.safeParse({ ...base, status: "DEMO", demoEndsOn: "" }))).toEqual(["demoEndsOn"]);
    expect(issues(enrollSchema.safeParse({ ...base, status: "DEMO", demoEndsOn: "2025-09-15" }))).toEqual(["demoEndsOn"]);
    expect(issues(enrollSchema.safeParse({ ...base, status: "DEMO", demoEndsOn: "2025-09-16" }))).toEqual([]);
    // Ücretli kayıtta demo bitişi aranmaz.
    expect(issues(enrollSchema.safeParse({ ...base, status: "UCRETLI", demoEndsOn: "" }))).not.toContain("demoEndsOn");
    expect(issues(enrollSchema.safeParse({ ...base, status: "UCRETLI" })).sort()).toEqual(
      ["address", "idNumber", "licenseDiscount", "licenseStartsOn"].sort()
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
