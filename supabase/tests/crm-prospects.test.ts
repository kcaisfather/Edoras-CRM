/** 20260929180000_crm_prospects — soğuk listeler, kişiler, toplu ekleme ve "Sıcağa taşı" (PGlite, düzenek harness.ts). */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let actor: string;

async function list(name = "Eylül fuarı"): Promise<string> {
  return (await h().one<{ id: string }>("insert into crm_prospect_lists (name, created_by) values ($1, $2) returning id", [name, actor])).id;
}

/** Tek kişi; kolonlar serbest. */
async function prospect(listId: string, cols: Record<string, unknown> = { first_name: "Ayşe" }): Promise<string> {
  const keys = ["list_id", ...Object.keys(cols)];
  const row = await h().one<{ id: string }>(
    `insert into crm_prospects (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    [listId, ...Object.values(cols)]
  );
  return row.id;
}

/** Fonksiyonu sunucunun rolüyle (service_role) çağırır: yetkiler de sınanır. */
async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function addRows(listId: string, rows: Record<string, unknown>[]): Promise<number[]> {
  return asService(async () => {
    const row = await h().one<{ skipped: number[] }>("select crm_add_prospects($1, $2, $3) as skipped", [listId, JSON.stringify(rows), actor]);
    return row.skipped;
  });
}

async function convert(id: string, status = "ARANACAK", note: string | null = null): Promise<string> {
  return asService(async () => {
    const row = await h().one<{ lead: string }>("select crm_convert_prospect($1, $2, $3, $4, $5) as lead", [id, status, note, actor, "Ayşe Temsilci"]);
    return row.lead;
  });
}

async function fails(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    const e = err as { message?: string; constraint?: string };
    return e.constraint ?? e.message ?? String(err);
  }
}

const count = async (sql: string, params: unknown[] = []) => (await h().one<{ n: number }>(`select count(*)::int as n ${sql}`, params)).n;

beforeAll(async () => {
  db = await createTestDb();
  actor = await h().newUser("temsilci@edorasapp.ai");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("kurulum", () => {
  it("liste ve kişi tabloları anon ve authenticated rollerine kapalı", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      const lists = await h().failure("select * from public.crm_prospect_lists");
      const people = await h().failure("select * from public.crm_prospects");
      await db.exec("reset role");
      expect(lists).toMatch(/permission denied/);
      expect(people).toMatch(/permission denied/);
    }
  });

  it("fonksiyonlar PUBLIC'e kapalı, service_role'e açık", async () => {
    const fns = [
      "public.crm_add_prospects(uuid, jsonb, uuid)",
      "public.crm_convert_prospect(uuid, text, text, uuid, text)",
      "public.crm_prospect_list_counts()",
      "public.crm_prospects_normalize()",
      "public.crm_prospect_lists_normalize()",
    ];
    for (const fn of fns) {
      for (const role of ["anon", "authenticated"]) {
        const row = await h().one<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]);
        expect(row.ok, `${role} ${fn}`).toBe(false);
      }
    }
    for (const fn of fns.slice(0, 3)) {
      const row = await h().one<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'execute') as ok", [fn]);
      expect(row.ok).toBe(true);
    }
  });

  it("varsayılanlar: aranmadı, sonuç anı yok, taşınmadı; sıra artar", async () => {
    const l = await list();
    const a = await prospect(l);
    const b = await prospect(l, { first_name: "Mehmet" });
    const rows = await db.query<{ id: string; outcome: string; outcome_at: string | null; moved_at: string | null; seq: string }>(
      "select id, outcome, outcome_at, moved_at, seq from crm_prospects where id in ($1, $2) order by seq",
      [a, b]
    );
    expect(rows.rows.map((r) => r.id)).toEqual([a, b]);
    expect(rows.rows[0]).toMatchObject({ outcome: "NOT_CALLED", outcome_at: null, moved_at: null });
  });
});

describe("liste kuralları", () => {
  it("ad 1–120 karakter; boşluk kırpılır, boş ad kaçamak değildir", async () => {
    expect(await h().failure("insert into crm_prospect_lists (name) values ('   ')")).toBe("crm_prospect_lists_name_check");
    expect(await h().failure("insert into crm_prospect_lists (name) values ($1)", ["x".repeat(121)])).toBe(
      "crm_prospect_lists_name_check"
    );
    const id = await list("  Kış   fuarı ");
    expect((await h().one<{ name: string }>("select name from crm_prospect_lists where id = $1", [id])).name).toBe("Kış fuarı");
  });

  it("liste başına kişi sayısı", async () => {
    const a = await list("Sayım A");
    const b = await list("Sayım B");
    await prospect(a);
    await prospect(a, { organization: "İki" });
    await prospect(b);
    const rows = await asService(() =>
      db.query<{ list_id: string; total: number }>("select list_id, total::int as total from crm_prospect_list_counts() where list_id in ($1, $2)", [a, b])
    );
    expect(Object.fromEntries(rows.rows.map((r) => [r.list_id, r.total]))).toEqual({ [a]: 2, [b]: 1 });
  });

  it("liste silinince kişileri de silinir", async () => {
    const l = await list("Silinecek");
    await prospect(l);
    await prospect(l, { organization: "Işık Dershanesi" });
    await db.query("delete from crm_prospect_lists where id = $1", [l]);
    expect(await count("from crm_prospects where list_id = $1", [l])).toBe(0);
  });
});

describe("kişi kuralları", () => {
  let l: string;
  beforeAll(async () => {
    l = await list("Kurallar");
  });

  it("ad, soyad, kurum, telefon ya da e-posta olmadan kişi eklenmez; boşluk kaçamak değildir", async () => {
    expect(await h().failure("insert into crm_prospects (list_id, city) values ($1, 'İzmir')", [l])).toBe("crm_prospects_identity_check");
    expect(await h().failure("insert into crm_prospects (list_id, first_name, organization) values ($1, '  ', ' ')", [l])).toBe(
      "crm_prospects_identity_check"
    );
    expect(await h().failure("insert into crm_prospects (list_id, phone_raw) values ($1, '12')", [l])).toBeNull();
  });

  it.each([
    [{ phone_raw: "0532", phone: "05321234567" }, "crm_prospects_phone_check"],
    [{ first_name: "A", phone: "+905321234567" }, "crm_prospects_phone_check"],
    [{ email_raw: "Ayse@X.com", email: "Ayse@X.com" }, "crm_prospects_email_check"],
    [{ email_raw: "ayse@", email: "ayse@" }, "crm_prospects_email_check"],
    [{ first_name: "A", email: "a@b.co" }, "crm_prospects_email_check"],
    [{ first_name: "A", outcome: "ARANDI", outcome_at: "2026-09-29T10:00:00Z" }, "crm_prospects_outcome_check"],
  ])("geçersiz değer reddedilir: %o", async (cols, constraint) => {
    expect(await fails(() => prospect(l, cols))).toBe(constraint);
  });

  it("sonuç anı ancak ve ancak aranmış kişide", async () => {
    expect(await fails(() => prospect(l, { first_name: "A", outcome: "UNREACHABLE" }))).toBe("crm_prospects_outcome_at_check");
    expect(await fails(() => prospect(l, { first_name: "A", outcome_at: new Date().toISOString() }))).toBe(
      "crm_prospects_outcome_at_check"
    );
    const id = await prospect(l, { first_name: "Sonuç" });
    expect(await h().failure("update crm_prospects set outcome = 'TALKED', outcome_at = now() where id = $1", [id])).toBeNull();
    // Aranmadı'ya dönerken sonuç anı temizlenmezse reddedilir.
    expect(await h().failure("update crm_prospects set outcome = 'NOT_CALLED' where id = $1", [id])).toBe("crm_prospects_outcome_at_check");
    expect(await h().failure("update crm_prospects set outcome = 'NOT_CALLED', outcome_at = null where id = $1", [id])).toBeNull();
  });

  it("aynı listede aynı telefon / e-posta bir kez; başka listede serbest", async () => {
    await prospect(l, { phone_raw: "0532 111 11 11", phone: "+905321111111", email_raw: "a@kurum.test", email: "a@kurum.test" });
    expect(await fails(() => prospect(l, { phone_raw: "5321111111", phone: "+905321111111" }))).toBe("crm_prospects_list_phone_key");
    expect(await fails(() => prospect(l, { email_raw: "A@kurum.test", email: "a@kurum.test" }))).toBe("crm_prospects_list_email_key");
    const other = await list("Başka liste");
    expect(await fails(() => prospect(other, { phone_raw: "0532 111 11 11", phone: "+905321111111" }))).toBeNull();
    // Normalize değeri olmayan (geçersiz) telefonlar çakışmaz.
    await prospect(l, { phone_raw: "12" });
    expect(await fails(() => prospect(l, { phone_raw: "12" }))).toBeNull();
  });

  it("boş metinler null olur, boşluklar tekilleşir", async () => {
    const id = await prospect(l, { first_name: "  Ali   Can ", city: "  ", branch: " YKS  ", note: "  " });
    const row = await h().one<{ first_name: string; city: string | null; branch: string; note: string | null }>(
      "select first_name, city, branch, note from crm_prospects where id = $1",
      [id]
    );
    expect(row).toEqual({ first_name: "Ali Can", city: null, branch: "YKS", note: null });
  });

  it("çok uzun alan reddedilir (aday sınırlarının altında)", async () => {
    expect(await fails(() => prospect(l, { organization: "x".repeat(201) }))).toBe("crm_prospects_length_check");
    expect(await fails(() => prospect(l, { first_name: "A", note: "x".repeat(1001) }))).toBe("crm_prospects_length_check");
  });

  it("aday bağı taşınma anı olmadan kurulamaz; aday silinince bağ boşalır, taşınma anı kalır", async () => {
    const leadId = (await h().one<{ id: string }>("insert into crm_leads (organization_name) values ('Bağ Koleji') returning id")).id;
    expect(await fails(() => prospect(l, { first_name: "A", crm_lead_id: leadId }))).toBe("crm_prospects_moved_check");
    const id = await prospect(l, { first_name: "Taşınan", crm_lead_id: leadId, moved_at: new Date().toISOString() });
    // Aday silme CHECK'e takılmaz.
    expect(await h().failure("delete from crm_leads where id = $1", [leadId])).toBeNull();
    const row = await h().one<{ crm_lead_id: string | null; moved: boolean }>(
      "select crm_lead_id, moved_at is not null as moved from crm_prospects where id = $1",
      [id]
    );
    expect(row).toEqual({ crm_lead_id: null, moved: true });
  });
});

describe("crm_add_prospects", () => {
  it("satırları sırasıyla ekler; aynı listedeki çakışmaları (önceden var ya da aynı istekte) atlayıp sırasını döndürür", async () => {
    const l = await list("Toplu");
    await prospect(l, { phone_raw: "0532 000 00 01", phone: "+905320000001" });
    const skipped = await addRows(l, [
      { first_name: "Bir", phone_raw: "0532 000 00 02", phone: "+905320000002" },
      { first_name: "Mevcut", phone_raw: "05320000001", phone: "+905320000001" },
      { first_name: "İki", email_raw: "iki@x.test", email: "iki@x.test" },
      { first_name: "Tekrar", phone_raw: "532 000 00 02", phone: "+905320000002" },
      { organization: "Üç Koleji", branch: "LGS" },
    ]);
    expect(skipped).toEqual([1, 3]);
    const names = await db.query<{ name: string; created_by: string }>(
      "select coalesce(first_name, organization) as name, created_by from crm_prospects where list_id = $1 order by seq",
      [l]
    );
    expect(names.rows.map((r) => r.name)).toEqual([null, "Bir", "İki", "Üç Koleji"]);
    expect(names.rows.slice(1).every((r) => r.created_by === actor)).toBe(true);
  });

  it("liste yoksa, gövde dizi değilse ya da 2000'den fazla satırsa reddeder", async () => {
    const missing = (await h().one<{ id: string }>("select gen_random_uuid() as id")).id;
    expect(await fails(() => addRows(missing, [{ first_name: "A" }]))).toMatch(/CRM_PROSPECT_LIST_NOT_FOUND/);
    const l = await list("Sınır");
    expect(
      await fails(() => asService(() => db.query("select crm_add_prospects($1, $2, $3)", [l, JSON.stringify({ a: 1 }), actor])))
    ).toMatch(/CRM_PROSPECT_INVALID/);
    const many = Array.from({ length: 2001 }, (_, i) => ({ first_name: `K${i}` }));
    expect(await fails(() => addRows(l, many))).toMatch(/CRM_PROSPECT_BATCH_TOO_LARGE/);
    expect(await count("from crm_prospects where list_id = $1", [l])).toBe(0);
  });

  it("bir satır kurala takılırsa hiçbiri eklenmez", async () => {
    const l = await list("Hepsi ya da hiç");
    expect(await fails(() => addRows(l, [{ first_name: "Geçerli" }, { city: "Yalnız şehir" }]))).toBe("crm_prospects_identity_check");
    expect(await count("from crm_prospects where list_id = $1", [l])).toBe(0);
  });
});

describe("crm_convert_prospect", () => {
  it("aday (COLD_LIST, seçilen statü) + not + taşındı işareti tek işlemde", async () => {
    const l = await list("Taşıma");
    const id = await prospect(l, {
      first_name: "Ayşe",
      last_name: "Demir",
      organization: "Örnek Dershanesi",
      phone_raw: "0532 000 00 09",
      phone: "+905320000009",
      email_raw: "ayse@ornek.test",
      email: "ayse@ornek.test",
      city: "İzmir",
      district: "Bornova",
      branch: "YKS",
    });
    const leadId = await convert(id, "TAKIPTE", "[Soğuk liste] Program: YKS");
    const lead = await h().one<Record<string, unknown>>(
      "select organization_name, contact_first_name, contact_last_name, contact_phone, contact_email, city, district, status, source, created_by from crm_leads where id = $1",
      [leadId]
    );
    expect(lead).toEqual({
      organization_name: "Örnek Dershanesi",
      contact_first_name: "Ayşe",
      contact_last_name: "Demir",
      contact_phone: "+905320000009",
      contact_email: "ayse@ornek.test",
      city: "İzmir",
      district: "Bornova",
      status: "TAKIPTE",
      source: "COLD_LIST",
      created_by: actor,
    });
    expect(await count("from crm_notes where lead_id = $1 and author_id = $2", [leadId, actor])).toBe(1);
    const p = await h().one<{ crm_lead_id: string; moved: boolean }>(
      "select crm_lead_id, moved_at is not null as moved from crm_prospects where id = $1",
      [id]
    );
    expect(p).toEqual({ crm_lead_id: leadId, moved: true });
    // İkinci kez taşınamaz.
    expect(await fails(() => convert(id))).toMatch(/CRM_PROSPECT_ALREADY_MOVED/);
  });

  it("statü yalnız Aranacak / Takipte / Randevu planlandı; kişi yoksa bulunamadı", async () => {
    const l = await list("Statü");
    const id = await prospect(l, { organization: "Statü Koleji" });
    expect(await fails(() => convert(id, "SATIS_OLDU"))).toMatch(/CRM_PROSPECT_STATUS_INVALID/);
    const missing = (await h().one<{ id: string }>("select gen_random_uuid() as id")).id;
    expect(await fails(() => convert(missing))).toMatch(/CRM_PROSPECT_NOT_FOUND/);
  });

  it("adayın kimlik kuralı tutmazsa (yalnız telefon) hiçbir şey yazılmaz", async () => {
    const l = await list("Kimliksiz");
    const id = await prospect(l, { phone_raw: "0532 000 00 07", phone: "+905320000007" });
    const before = await count("from crm_leads");
    expect(await fails(() => convert(id, "ARANACAK", "not"))).toBe("crm_leads_identity_check");
    expect(await count("from crm_leads")).toBe(before);
    const p = await h().one<{ moved: boolean }>("select moved_at is not null as moved from crm_prospects where id = $1", [id]);
    expect(p.moved).toBe(false);
  });

  it("adayı silinmiş kişi yeniden taşınabilir", async () => {
    const l = await list("Yeniden");
    const id = await prospect(l, { organization: "Yeniden Koleji" });
    const first = await convert(id);
    await db.query("delete from crm_leads where id = $1", [first]);
    const second = await convert(id, "RANDEVU_PLANLANDI");
    expect(second).not.toBe(first);
    expect((await h().one<{ crm_lead_id: string }>("select crm_lead_id from crm_prospects where id = $1", [id])).crm_lead_id).toBe(second);
  });
});
