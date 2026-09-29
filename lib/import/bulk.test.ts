import { describe, expect, it } from "vitest";
import {
  BULK_MAX_ITEMS,
  EMPTY_CONTACTS,
  bulkLeadsSchema,
  bulkProspectsSchema,
  contactSets,
  importItemSchema,
  recordToImportItem,
  screenImportItems,
  toLeadColumns,
  toProspectColumns,
  type ImportItem,
  type ScreenContext,
} from "./bulk";

const item = (over: Partial<ImportItem> = {}) => importItemSchema.parse({ firstName: "Ali", ...over });
const ctx = (over: Partial<ScreenContext> = {}): ScreenContext => ({
  target: "coldList",
  crm: EMPTY_CONTACTS,
  institutions: EMPTY_CONTACTS,
  list: EMPTY_CONTACTS,
  ...over,
});

describe("gövde şeması", () => {
  it("normalize değerleri ve mükerrer işaretlerini atar; boş alanlar '' olur", () => {
    const parsed = importItemSchema.parse({ firstName: "Ali", phone: "+905320000001", duplicate: false, phoneRaw: "0532" });
    expect(parsed).toEqual({
      firstName: "Ali",
      lastName: "",
      organization: "",
      phoneRaw: "0532",
      emailRaw: "",
      city: "",
      district: "",
      branch: "",
      note: "",
    });
  });

  it("istek başına en çok 2000 satır; boş istek geçersiz; dryRun varsayılan false", () => {
    expect(bulkProspectsSchema.safeParse({ items: [] }).success).toBe(false);
    const many = Array.from({ length: BULK_MAX_ITEMS + 1 }, () => ({ firstName: "A" }));
    expect(bulkProspectsSchema.safeParse({ items: many }).success).toBe(false);
    expect(bulkLeadsSchema.parse({ items: [{ firstName: "A" }] }).dryRun).toBe(false);
  });

  it("önizleme kaydından yalnız ham değerler gönderilir", () => {
    const body = recordToImportItem({
      id: "r2",
      rowNumber: 2,
      firstName: "Ali",
      lastName: "",
      organization: "",
      phoneRaw: "0532 000 00 01",
      phone: "+905320000001",
      emailRaw: "",
      email: null,
      city: "",
      district: "",
      branch: "YKS",
      note: "",
    });
    expect(body).toMatchObject({ row: 2, phoneRaw: "0532 000 00 01", branch: "YKS" });
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("email");
  });
});

describe("screenImportItems", () => {
  it("sunucu telefonu ve e-postayı ham metinden yeniden hesaplar", () => {
    const { accepted } = screenImportItems([item({ phoneRaw: " 0532 000 00 01 ", emailRaw: " Ali@X.co ", firstName: "  Ali   Can " })], ctx());
    expect(accepted[0]).toMatchObject({ row: 1, firstName: "Ali Can", phone: "+905320000001", email: "ali@x.co" });
  });

  it("dosya içi, liste, CRM ve kurum mükerrerlerini nedeniyle atlar", () => {
    const c = ctx({
      list: contactSets([{ phone: "+905320000002" }]),
      crm: contactSets([{ email: "crm@x.co" }]),
      institutions: contactSets([{ phone: "0532 000 00 03" }]),
    });
    const res = screenImportItems(
      [
        item({ row: 2, phoneRaw: "0532 000 00 01" }),
        item({ row: 3, phoneRaw: "532 000 0001" }),
        item({ row: 4, phoneRaw: "05320000002" }),
        item({ row: 5, emailRaw: "CRM@x.co" }),
        item({ row: 6, phoneRaw: "+90 532 000 00 03" }),
        item({ row: 7, emailRaw: "yeni@x.co" }),
      ],
      c
    );
    expect(res.accepted.map((n) => n.row)).toEqual([2, 7]);
    expect(res.skipped).toEqual([
      { row: 3, reason: "DUPLICATE_IN_FILE" },
      { row: 4, reason: "DUPLICATE_IN_LIST" },
      { row: 5, reason: "DUPLICATE_CRM" },
      { row: 6, reason: "DUPLICATE_INSTITUTION" },
    ]);
  });

  it("mükerrer olarak atlanan satır dosya içi karşılaştırmaya girmez", () => {
    const res = screenImportItems(
      [item({ row: 2, phoneRaw: "05320000005" }), item({ row: 3, phoneRaw: "05320000005" })],
      ctx({ crm: contactSets([{ phone: "+905320000005" }]) })
    );
    expect(res.skipped.map((s) => s.reason)).toEqual(["DUPLICATE_CRM", "DUPLICATE_CRM"]);
  });

  it("soğuk liste: geçersiz telefon / e-posta ham olarak kalır; boş ve çok uzun satır atlanır", () => {
    const res = screenImportItems(
      [item({ phoneRaw: "12", emailRaw: "ali@x" }), item({ firstName: "", city: "İzmir" }), item({ note: "x".repeat(1001) })],
      ctx()
    );
    expect(res.accepted[0]).toMatchObject({ phoneRaw: "12", phone: null, emailRaw: "ali@x", email: null });
    expect(res.skipped).toEqual([
      { row: 2, reason: "EMPTY" },
      { row: 3, reason: "TOO_LONG" },
    ]);
  });

  it("CRM adayı: kimlik zorunlu, telefon ve e-posta geçerli olmalı", () => {
    const res = screenImportItems(
      [
        item({ firstName: "", phoneRaw: "05320000001" }),
        item({ phoneRaw: "12" }),
        item({ emailRaw: "ali@x" }),
        item({ firstName: "", organization: "Kurum", phoneRaw: "05320000001" }),
      ],
      ctx({ target: "crm", list: undefined })
    );
    expect(res.skipped.map((s) => s.reason)).toEqual(["IDENTITY_REQUIRED", "INVALID_PHONE", "INVALID_EMAIL"]);
    expect(res.accepted.map((n) => n.row)).toEqual([4]);
  });

  it("kolon eşlemesi: aday tutar yazmaz, statü Aranacak, kaynak IMPORT", () => {
    const [n] = screenImportItems([item({ organization: "Kurum", phoneRaw: "05320000001", branch: "YKS" })], ctx()).accepted;
    expect(toProspectColumns(n)).toMatchObject({ first_name: "Ali", organization: "Kurum", phone: "+905320000001", branch: "YKS" });
    const lead = toLeadColumns(n, "actor");
    expect(lead).toMatchObject({ status: "ARANACAK", source: "IMPORT", contact_phone: "+905320000001", created_by: "actor" });
    expect(lead).not.toHaveProperty("offer_amount");
    expect(lead).not.toHaveProperty("sale_amount");
  });
});
