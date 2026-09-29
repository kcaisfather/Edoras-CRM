import { describe, expect, it } from "vitest";
import { emptyLeadForm, formToCreate, formToPatch, leadFormSchema, leadToForm } from "./form";
import { leadCreateSchema, leadPatchSchema } from "./schemas";
import type { CrmLead } from "./types";

const lead: CrmLead = {
  id: "l1",
  organizationName: "Işık Koleji",
  contactFirstName: "Ayşe",
  contactLastName: "Yılmaz",
  contactPhone: "+905321234567",
  status: "TAKIPTE",
  nextFollowUpAt: "2026-10-01",
  offerAmount: 12500.5,
  saleAmount: null,
};

describe("aday formu", () => {
  it("kayıttan form değerleri (telefon okunur biçimde, tutar TR yazımıyla)", () => {
    expect(leadToForm(lead)).toMatchObject({ phone: "0532 123 45 67", offerAmount: "12500,5", saleAmount: "", nextCall: "2026-10-01" });
  });

  it("kurum adı ya da yetkili adı zorunlu; telefon / e-posta / tutar doğrulanır", () => {
    expect(leadFormSchema.safeParse(emptyLeadForm()).success).toBe(false);
    const bad = leadFormSchema.safeParse({ ...emptyLeadForm(), organizationName: "A", phone: "12", email: "x@", offerAmount: "abc" });
    expect(bad.error?.issues.map((i) => i.path.join(".")).sort()).toEqual(["email", "offerAmount", "phone"]);
  });

  it("düzenleme gövdesi API şemasından geçer; takip dışı statüde tarih ve neden gönderilmez", () => {
    const body = formToPatch({ ...leadToForm(lead), status: "ARANACAK", lostReason: "FIYAT" }, lead, true);
    expect(body).toMatchObject({ status: "ARANACAK", nextFollowUpAt: null, lostReason: null, offerAmount: 12500.5 });
    expect("saleAmount" in body).toBe(false);
    expect(leadPatchSchema.safeParse(body).success).toBe(true);
  });

  it("satışa geçişte boş satış tutarı 0 TL; CRM_AGENT tutar göndermez", () => {
    expect(formToPatch({ ...leadToForm(lead), status: "SATIS_OLDU" }, lead, true).saleAmount).toBe(0);
    const agent = formToPatch({ ...leadToForm(lead), status: "SATIS_OLDU" }, lead, false);
    expect("saleAmount" in agent || "offerAmount" in agent).toBe(false);
  });

  it("kayıp nedeni yalnız Satış Olmadı'da gider", () => {
    const body = formToPatch({ ...leadToForm(lead), status: "OLUMSUZ", lostReason: "BUTCE", nextCall: "2026-12-25" }, lead, true);
    expect(body).toMatchObject({ lostReason: "BUTCE", nextFollowUpAt: "2026-12-25" });
  });

  it("yeni aday gövdesi API şemasından geçer", () => {
    const body = formToCreate({ ...emptyLeadForm("TEKLIF_VERILDI"), organizationName: "Yeni Kurum", phone: "0532 123 45 67" }, true);
    expect(body).toMatchObject({ organizationName: "Yeni Kurum", status: "TEKLIF_VERILDI", offerAmount: 0, source: "MANUAL" });
    const parsed = leadCreateSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
