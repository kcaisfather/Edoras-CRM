import { describe, expect, it } from "vitest";
import type { ImportRecord } from "@/lib/import/records";
import {
  leadToColdListSchema,
  prospectConvertSchema,
  prospectCreateSchema,
  prospectListCreateSchema,
  prospectPatchSchema,
  prospectQuerySchema,
} from "./schemas";
import type { Prospect } from "./types";
import {
  callableProspects,
  canMove,
  convertNoteText,
  crmContactSets,
  fillEmptyFields,
  hasLeadIdentity,
  isMoved,
  listSlug,
  prospectTitle,
  prospectToExisting,
} from "./utils";

const mk = (id: string, over: Partial<Prospect> = {}): Prospect => ({
  id,
  listId: "L1",
  firstName: "Ali",
  lastName: "Veli",
  organization: "Kurum",
  phoneRaw: "0532 000 00 01",
  phone: "+905320000001",
  emailRaw: "",
  email: null,
  city: "",
  district: "",
  branch: "",
  note: "",
  outcome: "NOT_CALLED",
  outcomeAt: null,
  crmLeadId: null,
  movedAt: null,
  createdAt: 1,
  ...over,
});

const record = (over: Partial<ImportRecord> = {}): ImportRecord => ({
  id: "r2",
  rowNumber: 2,
  firstName: "Ali",
  lastName: "Veli",
  organization: "Kurum",
  phoneRaw: "0532 000 00 01",
  phone: "+905320000001",
  emailRaw: "",
  email: null,
  city: "",
  district: "",
  branch: "",
  note: "",
  ...over,
});

describe("birleştirme", () => {
  it("yalnız boş alanları doldurur, notu ekler; telefon / e-posta ham gider", () => {
    const p = mk("p1", { city: "", note: "eski", phone: null, phoneRaw: "12" });
    const patch = fillEmptyFields(
      p,
      record({ firstName: "Başka", city: "İzmir", email: "a@x.com", emailRaw: "A@x.com", note: "yeni", phone: "+905320000009", phoneRaw: "0532 000 00 09" })
    );
    expect(patch).toEqual({ city: "İzmir", emailRaw: "A@x.com", phoneRaw: "0532 000 00 09", note: "eski | yeni" });
    expect(fillEmptyFields(mk("p2", { note: "aynı" }), record({ note: "aynı" }))).toEqual({});
  });
});

describe("Görevlerim'e düşen kişiler", () => {
  it("taşınan, ilgilenmeyen, CRM eşleşen ve tekrar eden telefonları atlar", () => {
    const crm = crmContactSets([
      { phone: "0533 000 00 05", email: null },
      { phone: null, email: " Crm@X.com " },
    ]);
    const items = callableProspects(
      [
        mk("a"),
        mk("b"), // a ile aynı telefon
        mk("c", { phone: "+905330000002", outcome: "UNREACHABLE", outcomeAt: 5 }),
        mk("d", { phone: "+905330000003", outcome: "NOT_INTERESTED", outcomeAt: 5 }),
        mk("e", { phone: "+905330000004", crmLeadId: "L9", movedAt: 5 }),
        mk("e2", { phone: "+905330000014", crmLeadId: null, movedAt: 5 }), // aday silinmiş, yine taşınmış sayılır
        mk("f", { phone: "+905330000005" }), // CRM'de (telefon)
        mk("h", { phone: "+905330000006", email: "crm@x.com" }), // CRM'de (e-posta)
        mk("g", { phone: null, phoneRaw: "" }),
        mk("i", { phone: null, phoneRaw: "12" }), // geçersiz ama aranabilir
      ],
      crm
    );
    expect(items.map((p) => p.id)).toEqual(["a", "c", "i"]);
  });

  it("taşınma ve yeniden taşıma kuralları", () => {
    expect(isMoved(mk("a"))).toBe(false);
    expect(isMoved(mk("a", { movedAt: 1, crmLeadId: null }))).toBe(true);
    expect(canMove(mk("a", { movedAt: 1, crmLeadId: null }))).toBe(true);
    expect(canMove(mk("a", { movedAt: 1, crmLeadId: "L" }))).toBe(false);
    expect(hasLeadIdentity(mk("a", { firstName: "", lastName: "", organization: "" }))).toBe(false);
  });
});

describe("görünüm yardımcıları", () => {
  it("ad, mevcut kayıt biçimi, taşıma notu, dosya adı", () => {
    expect(prospectTitle(mk("a", { firstName: "", lastName: "", organization: "" }))).toBe("0532 000 00 01");
    expect(prospectToExisting(mk("a"), "Fuar")).toMatchObject({ source: "coldList", id: "a", name: "Ali Veli", context: "Fuar" });
    expect(convertNoteText(mk("a", { branch: "YKS", note: "Fuarda tanıştık" }))).toBe("[Soğuk liste] Program / tür: YKS · Fuarda tanıştık");
    expect(convertNoteText(mk("a"))).toBeNull();
    expect(listSlug("Eylül Fuarı 2026!")).toBe("eylül-fuarı-2026");
    expect(listSlug("!!!")).toBe("liste");
  });
});

describe("şemalar", () => {
  it("liste adı kırpılır, 1–120", () => {
    expect(prospectListCreateSchema.parse({ name: "  Fuar ", sourceFile: " " })).toEqual({ name: "Fuar", sourceFile: null });
    expect(prospectListCreateSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(prospectListCreateSchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
  });

  it("patch: sunucunun hesapladığı alanlar atılır, boş patch geçersiz", () => {
    expect(prospectPatchSchema.parse({ outcome: "TALKED", outcomeAt: 5, phone: "+90", movedAt: 1 })).toEqual({ outcome: "TALKED" });
    expect(prospectPatchSchema.safeParse({}).success).toBe(false);
    expect(prospectPatchSchema.safeParse({ outcome: "ARANDI" }).success).toBe(false);
  });

  it("taşıma statüsü yalnız Aranacak / Takipte / Randevu planlandı; sorgu varsayılanları", () => {
    expect(prospectConvertSchema.parse({ status: "TAKIPTE" })).toEqual({ status: "TAKIPTE", addNote: false });
    expect(prospectConvertSchema.safeParse({ status: "SATIS_OLDU" }).success).toBe(false);
    const listId = "00000000-0000-4000-8000-000000000001";
    expect(prospectQuerySchema.parse({ listId })).toEqual({ listId, page: 0, size: 1000 });
    expect(prospectQuerySchema.safeParse({ listId, size: "5000" }).success).toBe(false);
  });
});

describe("Kişi ekle şeması", () => {
  it("boş alanlar \"\" olur; tek kimlik alanı yeter", () => {
    expect(prospectCreateSchema.parse({ organization: "Kurum" })).toEqual({
      firstName: "",
      lastName: "",
      organization: "Kurum",
      phoneRaw: "",
      emailRaw: "",
      city: "",
      district: "",
      branch: "",
      note: "",
    });
    expect(prospectCreateSchema.safeParse({ phoneRaw: "0532 000 00 01" }).success).toBe(true);
  });

  it("kimliksiz kişi (yalnız şehir / not) reddedilir", () => {
    const r = prospectCreateSchema.safeParse({ city: "İstanbul", note: "fuar" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["organization"]);
    expect(prospectCreateSchema.safeParse({ firstName: "   " }).success).toBe(false);
  });

  it("geçersiz telefon / e-posta reddedilir (içe aktarmanın aksine ham saklanmaz)", () => {
    const phone = prospectCreateSchema.safeParse({ firstName: "Ali", phoneRaw: "12" });
    expect(phone.success).toBe(false);
    expect(phone.error?.issues.map((i) => i.path[0])).toEqual(["phoneRaw"]);
    const email = prospectCreateSchema.safeParse({ firstName: "Ali", emailRaw: "ali@yok" });
    expect(email.error?.issues.map((i) => i.path[0])).toEqual(["emailRaw"]);
    expect(prospectCreateSchema.safeParse({ firstName: "Ali", emailRaw: "Ali@Ornek.com" }).success).toBe(true);
  });

  it("uzunluk sınırları içe aktarmayla aynı", () => {
    expect(prospectCreateSchema.safeParse({ organization: "x".repeat(201) }).success).toBe(false);
    expect(prospectCreateSchema.safeParse({ organization: "x".repeat(200) }).success).toBe(true);
  });
});

describe("Soğuk listeye geri gönder şeması", () => {
  const listId = "00000000-0000-4000-8000-000000000001";
  it("liste ve kayıp nedeni zorunlu", () => {
    expect(leadToColdListSchema.parse({ listId, lostReason: "OTHER" })).toEqual({ listId, lostReason: "OTHER" });
    expect(leadToColdListSchema.safeParse({ listId }).success).toBe(false);
    expect(leadToColdListSchema.safeParse({ listId: "liste", lostReason: "OTHER" }).success).toBe(false);
    expect(leadToColdListSchema.safeParse({ listId, lostReason: "FIYAT" }).success).toBe(false);
  });
});
