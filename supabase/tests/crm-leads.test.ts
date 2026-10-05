/** 20260929160000_crm_leads — adaylar ve notlar (PGlite, düzenek harness.ts). */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);

async function newId(): Promise<string> {
  return (await h().one<{ id: string }>("select gen_random_uuid() as id")).id;
}

/** Yalnız kurum adıyla aday; id döner. */
async function lead(org = "Işıklar Koleji", extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["organization_name", ...Object.keys(extra)];
  const params = [org, ...Object.values(extra)];
  const row = await h().one<{ id: string }>(
    `insert into crm_leads (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    params
  );
  return row.id;
}

beforeAll(async () => {
  db = await createTestDb();
  // Teklif / satış tutarı ve satışta hesap şartı (20261005170000) bu dosyanın konusu değil: crm-lead-sale-rules.test.ts.
  await db.exec("alter table crm_leads disable trigger crm_leads_sale_rules");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("kurulum", () => {
  it("aday ve not tabloları anon ve authenticated rollerine kapalı", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      const leads = await h().failure("select * from public.crm_leads");
      const notes = await h().failure("select * from public.crm_notes");
      await db.exec("reset role");
      expect(leads).toMatch(/permission denied/);
      expect(notes).toMatch(/permission denied/);
    }
  });

  it("normalleştirme fonksiyonu PUBLIC'e açık değil", async () => {
    for (const role of ["anon", "authenticated"]) {
      const row = await h().one<{ ok: boolean }>(
        "select has_function_privilege($1, 'public.crm_leads_normalize()', 'execute') as ok",
        [role]
      );
      expect(row.ok).toBe(false);
    }
  });

  it("varsayılanlar: statü Aranacak, kaynak elle", async () => {
    const id = await lead("Varsayılan Dershanesi");
    const row = await h().one<{ status: string; source: string }>("select status, source from crm_leads where id = $1", [id]);
    expect(row).toEqual({ status: "ARANACAK", source: "MANUAL" });
  });
});

describe("kimlik ve biçim kuralları", () => {
  it("kurum adı ya da yetkili adı olmadan aday açılmaz; boşluk kaçamak değildir", async () => {
    expect(await h().failure("insert into crm_leads (city) values ('İzmir')")).toBe("crm_leads_identity_check");
    expect(await h().failure("insert into crm_leads (organization_name, contact_first_name) values ('   ', '  ')")).toBe(
      "crm_leads_identity_check"
    );
    expect(await h().failure("insert into crm_leads (contact_last_name) values ('Yılmaz')")).toBeNull();
  });

  it("boş metinler null olur, boşluklar tekilleşir, e-posta küçük harfe iner", async () => {
    const id = await lead("  Deneme   Koleji ", { city: "  ", contact_email: "  Ayse@Kurum.TEST " });
    const row = await h().one<{ organization_name: string; city: string | null; contact_email: string }>(
      "select organization_name, city, contact_email from crm_leads where id = $1",
      [id]
    );
    expect(row).toEqual({ organization_name: "Deneme Koleji", city: null, contact_email: "ayse@kurum.test" });
  });

  it.each([
    ["contact_phone", "05321234567", "crm_leads_contact_phone_check"],
    ["contact_email", "ayse@", "crm_leads_contact_email_check"],
    ["status", "SATIS", "crm_leads_status_check"],
    ["source", "WEB", "crm_leads_source_check"],
    ["offer_amount", -1, "crm_leads_offer_amount_check"],
    ["sale_amount", -0.01, "crm_leads_sale_amount_check"],
  ])("%s geçersiz değeri reddedilir", async (column, value, constraint) => {
    expect(await h().failure(`insert into crm_leads (organization_name, ${column}) values ('Kural Kurumu', $1)`, [value])).toBe(
      constraint
    );
  });

  it("geçerli telefon (E.164) ve e-posta kabul edilir; tutar 0 olabilir", async () => {
    expect(
      await h().failure(
        "insert into crm_leads (organization_name, contact_phone, contact_email, offer_amount, sale_amount) values ('Geçerli', '+905321234567', 'a@b.co', 0, 12500.50)"
      )
    ).toBeNull();
  });

  it("çok uzun alan reddedilir", async () => {
    expect(await h().failure("insert into crm_leads (organization_name) values ($1)", ["x".repeat(201)])).toBe(
      "crm_leads_length_check"
    );
  });
});

describe("statüye bağlı alanlar", () => {
  it("kayıp nedeni yalnız Satış Olmadı (OLUMSUZ) statüsünde ve tanımlı değerlerden", async () => {
    expect(await h().failure("insert into crm_leads (organization_name, lost_reason) values ('A', 'PRICE')")).toBe(
      "crm_leads_lost_reason_check"
    );
    expect(await h().failure("insert into crm_leads (organization_name, status, lost_reason) values ('A', 'OLUMSUZ', 'UYDURMA')")).toBe(
      "crm_leads_lost_reason_check"
    );
    const id = await lead("Kayıp Kurum", { status: "OLUMSUZ", lost_reason: "BUDGET_NOT_APPROVED" });
    // Statü değişirken neden temizlenmezse reddedilir.
    expect(await h().failure("update crm_leads set status = 'TAKIPTE' where id = $1", [id])).toBe("crm_leads_lost_reason_check");
    expect(await h().failure("update crm_leads set status = 'TAKIPTE', lost_reason = null where id = $1", [id])).toBeNull();
  });

  it("satış tarihi yalnız Satış Oldu statüsünde", async () => {
    expect(await h().failure("insert into crm_leads (organization_name, sold_at) values ('A', current_date)")).toBe(
      "crm_leads_sold_at_check"
    );
    expect(
      await h().failure("insert into crm_leads (organization_name, status, sold_at) values ('A', 'SATIS_OLDU', current_date)")
    ).toBeNull();
  });

  it("sonraki arama ve teklif tarihi her statüde tutulabilir (görev modülü için)", async () => {
    expect(
      await h().failure(
        "insert into crm_leads (organization_name, next_follow_up_at, offer_sent_at) values ('A', '2026-10-01', '2026-09-29')"
      )
    ).toBeNull();
  });

  it("güncellemede updated_at ilerler", async () => {
    const id = await lead("Zaman Kurumu");
    await db.query("update crm_leads set updated_at = now() - interval '1 day' where id = $1", [id]);
    const before = await h().one<{ t: string }>("select updated_at::text as t from crm_leads where id = $1", [id]);
    await db.query("update crm_leads set city = 'Ankara' where id = $1", [id]);
    const after = await h().one<{ t: string }>("select updated_at::text as t from crm_leads where id = $1", [id]);
    expect(after.t > before.t).toBe(true);
  });
});

describe("kurum bağlantısı", () => {
  it("bir kuruma en fazla bir aday bağlanır; bağsız adaylar sınırsız", async () => {
    const institution = await newId();
    await lead("Bağlı Kurum", { institution_id: institution });
    expect(await h().failure("insert into crm_leads (organization_name, institution_id) values ('İkinci', $1)", [institution])).toMatch(
      /crm_leads_institution_id_key|duplicate/
    );
    await lead("Bağsız 1");
    await lead("Bağsız 2");
    const other = await lead("Başka");
    expect(await h().failure("update crm_leads set institution_id = $1 where id = $2", [institution, other])).toMatch(
      /crm_leads_institution_id_key|duplicate/
    );
  });
});

describe("notlar", () => {
  it("aday silinince notları da silinir", async () => {
    const author = await h().newUser("temsilci@edorasapp.ai");
    const id = await lead("Notlu Kurum");
    await db.query("insert into crm_notes (lead_id, author_id, author_name, content) values ($1, $2, 'Temsilci', 'Arandı')", [
      id,
      author,
    ]);
    await db.query("insert into crm_notes (lead_id, content) values ($1, '[SIKAYET|teknik|orta|acik]')", [id]);
    expect((await h().one<{ n: number }>("select count(*)::int as n from crm_notes where lead_id = $1", [id])).n).toBe(2);
    await db.query("delete from crm_leads where id = $1", [id]);
    expect((await h().one<{ n: number }>("select count(*)::int as n from crm_notes where lead_id = $1", [id])).n).toBe(0);
  });

  it("boş ya da çok uzun not reddedilir; olmayan adaya not yazılmaz", async () => {
    const id = await lead("Not Kuralı");
    expect(await h().failure("insert into crm_notes (lead_id, content) values ($1, '   ')", [id])).toBe("crm_notes_content_check");
    expect(await h().failure("insert into crm_notes (lead_id, content) values ($1, $2)", [id, "x".repeat(5001)])).toBe(
      "crm_notes_content_check"
    );
    expect(await h().failure("insert into crm_notes (lead_id, content) values ($1, 'x')", [await newId()])).toBe(
      "crm_notes_lead_id_fkey"
    );
  });

  it("yazar silinirse not kalır, yazar adı korunur", async () => {
    const author = await h().newUser("ayrilan@edorasapp.ai");
    const id = await lead("Yazar Kurumu");
    const note = await h().one<{ id: string }>(
      "insert into crm_notes (lead_id, author_id, author_name, content) values ($1, $2, 'Ayrılan Kişi', 'Not') returning id",
      [id, author]
    );
    await db.query("delete from auth.users where id = $1", [author]);
    const row = await h().one<{ author_id: string | null; author_name: string }>(
      "select author_id, author_name from crm_notes where id = $1",
      [note.id]
    );
    expect(row).toEqual({ author_id: null, author_name: "Ayrılan Kişi" });
  });
});
