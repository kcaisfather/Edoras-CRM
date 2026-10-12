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
  activeProspectFilterCount,
  callableProspects,
  canMove,
  convertNoteText,
  crmContactSets,
  EMPTY_PROSPECT_FILTER,
  fillEmptyFields,
  filterProspects,
  hasLeadIdentity,
  isMoved,
  listSlug,
  prospectMatchesQuery,
  prospectTitle,
  prospectToExisting,
  toPresenceFilter,
  type ProspectDetailFilter,
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

describe("detaylı süzgeç", () => {
  const people = [
    mk("a", { city: "Edirne", district: "Keşan", branch: "YKS", note: "Fuarda tanıştık", organization: "Keşan Fen Lisesi" }),
    mk("b", {
      firstName: "Ayşe",
      lastName: "Işık",
      city: "EDİRNE",
      district: "Merkez",
      phone: "+902842350501",
      phoneRaw: "0284 235 05 01",
      email: "ayse@okul.k12.tr",
      emailRaw: "Ayse@Okul.k12.tr",
      branch: "LGS",
    }),
    mk("c", { firstName: "Can", city: "İstanbul", district: "Kadıköy", phone: null, phoneRaw: "", emailRaw: "can@yok", organization: "" }),
    mk("d", { firstName: "", lastName: "", organization: "Çağ Koleji", city: "", phone: null, phoneRaw: "0284-235 99 99", crmLeadId: "L1", movedAt: 3 }),
  ];
  const run = (f: Partial<ProspectDetailFilter>, opts?: Parameters<typeof filterProspects>[2]) =>
    filterProspects(people, { ...EMPTY_PROSPECT_FILTER, ...f }, opts).map((p) => p.id);

  it("boş süzgeç hepsini sırasıyla döndürür", () => {
    expect(run({})).toEqual(["a", "b", "c", "d"]);
    expect(activeProspectFilterCount(EMPTY_PROSPECT_FILTER)).toBe(0);
    expect(activeProspectFilterCount({ ...EMPTY_PROSPECT_FILTER, city: "Edirne", inCrm: "no", phone: "  " })).toBe(2);
  });

  it("il / ilçe: tam eşleşme, Türkçe büyük-küçük harf farkı yok", () => {
    expect(run({ city: "Edirne" })).toEqual(["a", "b"]);
    expect(run({ city: "edirne" })).toEqual(["a", "b"]);
    expect(run({ city: "Edir" })).toEqual([]);
    expect(run({ city: "Edirne", district: "KEŞAN" })).toEqual(["a"]);
    expect(run({ district: "kadikoy" })).toEqual(["c"]);
  });

  it("telefon: yalnız rakamlar, E.164 ve ham yazım", () => {
    expect(run({ phone: "0284 235" })).toEqual(["b", "d"]);
    expect(run({ phone: "+90 284 235 05" })).toEqual(["b"]);
    expect(run({ phone: "5320000001" })).toEqual(["a"]);
    expect(run({ phone: "0555" })).toEqual([]);
  });

  it("e-posta, kurum, ad soyad, not: içerme; program / tür: tam eşleşme", () => {
    expect(run({ email: "OKUL" })).toEqual(["b"]);
    expect(run({ email: "can@" })).toEqual(["c"]);
    expect(run({ organization: "çağ" })).toEqual(["d"]);
    expect(run({ organization: "kesan fen" })).toEqual(["a"]);
    expect(run({ name: "ayşe ışık" })).toEqual(["b"]);
    expect(run({ name: "AYSE ISIK" })).toEqual(["b"]);
    expect(run({ note: "fuarda" })).toEqual(["a"]);
    expect(run({ branch: "yks" })).toEqual(["a"]);
    expect(run({ branch: "Y" })).toEqual([]);
  });

  it("telefon / e-posta kaydı var-yok (normalize ya da ham)", () => {
    expect(run({ hasPhone: "no" })).toEqual(["c"]);
    expect(run({ hasPhone: "yes" })).toEqual(["a", "b", "d"]);
    expect(run({ hasEmail: "yes" })).toEqual(["b", "c"]);
    expect(run({ hasEmail: "no", hasPhone: "yes" })).toEqual(["a", "d"]);
  });

  it("CRM'de kayıtlı: taşınmış ya da CRM eşleşmesi olan", () => {
    const hasCrmMatch = (p: Prospect) => p.id === "b";
    expect(run({ inCrm: "yes" }, { hasCrmMatch })).toEqual(["b", "d"]);
    expect(run({ inCrm: "no" }, { hasCrmMatch })).toEqual(["a", "c"]);
    expect(run({ inCrm: "yes" })).toEqual(["d"]);
  });

  it("alanlar ve serbest arama VE ile birleşir", () => {
    expect(run({ city: "Edirne", hasEmail: "yes" })).toEqual(["b"]);
    expect(run({ city: "Edirne" }, { q: "keşan" })).toEqual(["a"]);
    expect(run({}, { q: "ISIK" })).toEqual(["b"]);
  });

  it("serbest arama: alanlarda geçer, telefon yazım farkından bağımsız", () => {
    expect(prospectMatchesQuery(people[1], "0284 235 05")).toBe(true);
    expect(prospectMatchesQuery(people[1], "284-235")).toBe(true);
    expect(prospectMatchesQuery(people[0], "0284")).toBe(false);
    expect(prospectMatchesQuery(people[2], "kadıköy")).toBe(true);
    expect(prospectMatchesQuery(people[2], "can@yok")).toBe(true);
    expect(prospectMatchesQuery(people[2], "  ")).toBe(true);
  });

  it("URL var / yok değeri", () => {
    expect(toPresenceFilter("yes")).toBe("yes");
    expect(toPresenceFilter("no")).toBe("no");
    expect(toPresenceFilter("evet")).toBe("");
    expect(toPresenceFilter(null)).toBe("");
  });
});
