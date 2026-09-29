import { describe, expect, it } from "vitest";
import { leadCreateSchema, leadLinkSchema, leadPatchSchema, noteSchema, toContactColumns } from "./schemas";

const fieldErrors = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  (result.error?.issues ?? []).map((i) => i.path.join("."));

describe("leadCreateSchema", () => {
  it("yalnız kurum adı yeter; varsayılanlar Aranacak / elle", () => {
    const r = leadCreateSchema.safeParse({ organizationName: "Işıklar Koleji" });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ status: "ARANACAK", source: "MANUAL", nextFollowUpAt: null, lostReason: null, institutionId: null });
  });

  it("kurum adı da yetkili adı da yoksa reddedilir", () => {
    expect(fieldErrors(leadCreateSchema.safeParse({ city: "İzmir" }))).toEqual(["organizationName"]);
    expect(leadCreateSchema.safeParse({ contactLastName: "Yılmaz" }).success).toBe(true);
  });

  it("telefon, e-posta, tutar ve tarih doğrulanır", () => {
    const r = leadCreateSchema.safeParse({
      organizationName: "A",
      contactPhone: "123",
      contactEmail: "ayse@",
      offerAmount: -1,
      nextFollowUpAt: "01.10.2026",
    });
    expect(fieldErrors(r).sort()).toEqual(["contactEmail", "contactPhone", "nextFollowUpAt", "offerAmount"]);
  });

  it("aktör alanları gövdeden okunmaz", () => {
    const r = leadCreateSchema.safeParse({ organizationName: "A", createdBy: "x", updatedBy: "y" });
    expect(r.success && "createdBy" in r.data).toBe(false);
  });
});

describe("leadPatchSchema", () => {
  it("kısmi: yalnız gönderilen alanlar döner; boş tarih null olur", () => {
    const r = leadPatchSchema.safeParse({ status: "TAKIPTE", nextFollowUpAt: "" });
    expect(r.data).toEqual({ status: "TAKIPTE", nextFollowUpAt: null });
  });

  it("boş gövde reddedilir; tutar 2 haneye yuvarlanır", () => {
    expect(leadPatchSchema.safeParse({}).success).toBe(false);
    expect(leadPatchSchema.safeParse({ saleAmount: 10.456 }).data).toEqual({ saleAmount: 10.46 });
    expect(leadPatchSchema.safeParse({ saleAmount: null }).data).toEqual({ saleAmount: null });
  });

  it("tanımsız statü ve kayıp nedeni reddedilir", () => {
    expect(leadPatchSchema.safeParse({ status: "SATIS" }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ lostReason: "UYDURMA" }).success).toBe(false);
  });
});

describe("diğer şemalar", () => {
  it("bağlama için geçerli kurum id'si, not için 1–5000 karakter", () => {
    expect(leadLinkSchema.safeParse({ institutionId: "yok" }).success).toBe(false);
    expect(noteSchema.safeParse({ content: "   " }).success).toBe(false);
    expect(noteSchema.safeParse({ content: "x".repeat(5001) }).success).toBe(false);
    expect(noteSchema.safeParse({ content: " Arandı " }).data).toEqual({ content: "Arandı" });
  });
});

describe("toContactColumns", () => {
  it("boş → null, telefon E.164, e-posta küçük harf; verilmeyen alana dokunmaz", () => {
    expect(
      toContactColumns({ organizationName: "  Işık   Koleji ", contactPhone: "0532 123 45 67", contactEmail: " Ayse@Kurum.TEST", city: "" })
    ).toEqual({
      organization_name: "Işık Koleji",
      contact_phone: "+905321234567",
      contact_email: "ayse@kurum.test",
      city: null,
    });
  });
});
