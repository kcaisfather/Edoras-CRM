import { describe, expect, it } from "vitest";
import { emptyLeadForm, formToCreate, formToPatch, leadFormRuleErrors, leadToForm } from "./form";
import { accountIssues, leadSaleFormValues, leadSaleSchema, positiveAmount, saleAccountMode, type LeadSaleInput } from "./sale";
import type { CrmLead } from "./types";

const TCKN = "10000000146";

const lead = (over: Partial<CrmLead> = {}): CrmLead =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    organizationName: "Örnek Kolej",
    contactFirstName: "Ayşe",
    contactLastName: "Yılmaz",
    contactEmail: "ayse@kolej.test",
    contactPhone: "+905321234567",
    status: "TEKLIF_VERILDI",
    offerAmount: 45000,
    saleAmount: null,
    institutionId: null,
    ...over,
  }) as CrmLead;

const validSale = (over: Partial<LeadSaleInput> = {}): LeadSaleInput => ({
  ...leadSaleFormValues(lead()),
  idType: "TC",
  idNumber: TCKN,
  address: "Atatürk Cad. No: 12, Bakırköy / İstanbul",
  city: "İstanbul",
  district: "Bakırköy",
  ...over,
});

describe("positiveAmount", () => {
  it("> 0 Türkçe yazımı okur; boş, 0 ve okunamayan null", () => {
    expect(positiveAmount("12.500,50")).toBe(12500.5);
    expect(positiveAmount("")).toBeNull();
    expect(positiveAmount("0")).toBeNull();
    expect(positiveAmount("abc")).toBeNull();
  });
});

describe("saleAccountMode", () => {
  it("bağlı değil → NEW; kayıtsız kurum → ENROLL; DEMO → CONVERT; ücretli → PAID", () => {
    expect(saleAccountMode(lead())).toBe("NEW");
    expect(saleAccountMode(lead({ institutionId: "x", institution: null }))).toBe("ENROLL");
    const inst = (status: "DEMO" | "UCRETLI") => ({ crm: { status } }) as CrmLead["institution"];
    expect(saleAccountMode(lead({ institutionId: "x", institution: inst("DEMO") }))).toBe("CONVERT");
    expect(saleAccountMode(lead({ institutionId: "x", institution: inst("UCRETLI") }))).toBe("PAID");
  });
});

describe("leadSaleSchema", () => {
  it("başlangıç değerleri adaydan: tutar teklif tutarı, unvan kurum adı, fatura e-postası yetkili e-postası", () => {
    const v = leadSaleFormValues(lead());
    expect(v).toMatchObject({ saleAmount: "45000", legalName: "Örnek Kolej", email: "ayse@kolej.test", account: "NEW" });
    expect(v).toMatchObject({ institutionName: "Örnek Kolej", contactName: "Ayşe Yılmaz", contactPhone: "0532 123 45 67" });
  });

  it("tam girdi geçer; satış tutarı ve fatura bilgisi zorunlu", () => {
    expect(leadSaleSchema.safeParse(validSale()).success).toBe(true);
    const res = leadSaleSchema.safeParse(validSale({ saleAmount: "", idNumber: "", address: "", email: "" }));
    expect(res.success).toBe(false);
    const paths = res.success ? [] : res.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["saleAmount", "idNumber", "address", "email"]));
  });

  it("yeni hesapta kurum adı ve yetkili zorunlu; ücretli kurumda hesap alanı istenmez", () => {
    const bare = validSale({ institutionName: "", contactName: "Ayşe", contactPhone: "" });
    expect(accountIssues(bare, "NEW").map((i) => i.path[0])).toEqual(
      expect.arrayContaining(["institutionName", "contactName", "contactPhone"])
    );
    expect(accountIssues(bare, "ENROLL").map((i) => i.path[0])).not.toContain("institutionName");
    expect(accountIssues(bare, "PAID")).toEqual([]);
    expect(leadSaleSchema.safeParse({ ...bare, account: "PAID" }).success).toBe(true);
  });
});

describe("aday formu: teklif / satış kuralları", () => {
  it("yeni aday 'Satış oldu' olamaz; 'Teklif verildi' tutarsız olamaz (temsilci için de)", () => {
    expect(leadFormRuleErrors({ ...emptyLeadForm(), status: "SATIS_OLDU" }, { financial: true }).status).toBeTruthy();
    expect(leadFormRuleErrors({ ...emptyLeadForm(), status: "TEKLIF_VERILDI" }, { financial: false }).offerAmount).toBeTruthy();
    expect(leadFormRuleErrors({ ...emptyLeadForm(), status: "TEKLIF_VERILDI", offerAmount: "5.000" }, { financial: false })).toEqual({});
  });

  it("düzenlemede: teklifteki kaydın tutarını yönetici silemez; temsilci (tutarı görmez) engellenmez", () => {
    const form = { ...leadToForm(lead()), offerAmount: "" };
    expect(leadFormRuleErrors(form, { financial: true, previousStatus: "TEKLIF_VERILDI" }).offerAmount).toBeTruthy();
    expect(leadFormRuleErrors(form, { financial: false, previousStatus: "TEKLIF_VERILDI" })).toEqual({});
  });

  it("temsilci yalnız teklife geçerken teklif tutarını gönderir", () => {
    const create = formToCreate({ ...emptyLeadForm(), organizationName: "K", status: "TEKLIF_VERILDI", offerAmount: "7.500" }, false);
    expect(create.offerAmount).toBe(7500);
    const patch = formToPatch({ ...leadToForm(lead()), offerAmount: "9.000" }, lead(), false);
    expect("offerAmount" in patch).toBe(false);
  });
});
