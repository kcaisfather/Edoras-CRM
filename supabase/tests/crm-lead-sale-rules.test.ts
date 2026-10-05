/**
 * 20261005170000_crm_lead_sale_rules — teklif / satış tutarı zorunluluğu, satışta ücretli hesap + tam fatura profili
 * şartı ve crm_record_lead_sale (PGlite, düzenek harness.ts).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isValidVkn, todayIso } from "@/lib/domain/institutions/rules";
import { createTestDb, helpers } from "./harness";

const TCKN = "10000000146";
const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";

function vkn(nine: string): string {
  for (let c = 0; c <= 9; c++) if (isValidVkn(`${nine}${c}`)) return `${nine}${c}`;
  throw new Error("kontrol hanesi bulunamadı");
}
const VKN = vkn("123456789");

let db: PGlite;
const h = () => helpers(db);

const ENROLL =
  "select public.crm_enroll_institution($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12::numeric, null)";
const SALE = `select public.crm_record_lead_sale($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) as r`;

async function newId(): Promise<string> {
  return (await h().one<{ id: string }>("select gen_random_uuid() as id")).id;
}

async function enrollDemo(name: string): Promise<string> {
  const id = await newId();
  await db.query(ENROLL, [id, name, "DEMO", "Ayşe Yılmaz", "+905321234567", "ayse@kurum.test", null, null, null, todayIso(), null, null]);
  return id;
}

async function lead(org: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["organization_name", ...Object.keys(extra)];
  const row = await h().one<{ id: string }>(
    `insert into crm_leads (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    [org, ...Object.values(extra)]
  );
  return row.id;
}

/** Bireysel (TC) tam fatura profiliyle satış parametreleri. */
const personSale = (leadId: string, institutionId: string, amount: number | null, actor: string | null) => [
  leadId, institutionId, amount, ADDRESS, TCKN, null, "INDIVIDUAL", "Ayşe Yılmaz", null, "İstanbul", "Bakırköy", null,
  "fatura@kurum.test", "Yeni Kurum", actor,
];

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("teklif tutarı", () => {
  it("Teklif verildi'ye geçiş tutarsız (ya da 0) reddedilir; tutarla geçer", async () => {
    const id = await lead("Teklif A");
    expect(await h().failure("update crm_leads set status = 'TEKLIF_VERILDI' where id = $1", [id])).toMatch(/CRM_OFFER_AMOUNT_REQUIRED/);
    expect(await h().failure("update crm_leads set status = 'TEKLIF_VERILDI', offer_amount = 0 where id = $1", [id])).toMatch(
      /CRM_OFFER_AMOUNT_REQUIRED/
    );
    expect(await h().failure("update crm_leads set status = 'TEKLIF_VERILDI', offer_amount = 45000 where id = $1", [id])).toBeNull();
  });

  it("eklemede de zorunlu; teklif statüsündeyken tutar silinemez ama başka alan güncellenir", async () => {
    expect(await h().failure("insert into crm_leads (organization_name, status) values ('T', 'TEKLIF_VERILDI')")).toMatch(
      /CRM_OFFER_AMOUNT_REQUIRED/
    );
    const id = await lead("Teklif B", { status: "TEKLIF_VERILDI", offer_amount: 1000 });
    expect(await h().failure("update crm_leads set offer_amount = null where id = $1", [id])).toMatch(/CRM_OFFER_AMOUNT_REQUIRED/);
    expect(await h().failure("update crm_leads set city = 'Ankara' where id = $1", [id])).toBeNull();
  });
});

describe("satış: tutar + ücretli hesap + tam fatura profili", () => {
  it("bağlı kurumu olmayan ya da DEMO / profili eksik kuruma bağlı aday doğrudan satışa geçemez", async () => {
    const free = await lead("Satış A");
    expect(await h().failure("update crm_leads set status = 'SATIS_OLDU', sale_amount = 100, sold_at = current_date where id = $1", [free])).toMatch(
      /CRM_SALE_ACCOUNT_REQUIRED/
    );
    expect(await h().failure("update crm_leads set status = 'SATIS_OLDU', sold_at = current_date where id = $1", [free])).toMatch(
      /CRM_SALE_AMOUNT_REQUIRED/
    );
    const demo = await enrollDemo("Satış Demo");
    const linked = await lead("Satış B", { institution_id: demo });
    expect(
      await h().failure("update crm_leads set status = 'SATIS_OLDU', sale_amount = 100, sold_at = current_date where id = $1", [linked])
    ).toMatch(/CRM_SALE_ACCOUNT_REQUIRED/);
  });

  it("crm_record_lead_sale: DEMO → ücretli + profil + lisans (satış tutarı) + aday satışa geçer", async () => {
    const actor = await h().newUser("satis@edorasapp.ai");
    const inst = await enrollDemo("Satış Kurumu");
    const id = await lead("Satış Kurumu", { status: "TEKLIF_VERILDI", offer_amount: 50000, next_follow_up_at: "2026-11-01" });
    const { r } = await h().one<{ r: { licenseId: string | null; converted: boolean } }>(SALE, personSale(id, inst, 48000, actor));
    expect(r.converted).toBe(true);
    expect(r.licenseId).toBeTruthy();
    expect(
      await h().one("select status, billing_type, legal_name, tc_no, billing_email from crm_institutions where institution_id = $1", [inst])
    ).toEqual({ status: "UCRETLI", billing_type: "INDIVIDUAL", legal_name: "Ayşe Yılmaz", tc_no: TCKN, billing_email: "fatura@kurum.test" });
    const license = await h().one<{ price: string; starts_on: string }>(
      "select price::text as price, starts_on::text as starts_on from crm_licenses where id = $1",
      [r.licenseId]
    );
    expect(license).toEqual({ price: "48000.00", starts_on: todayIso() });
    expect(
      await h().one(
        "select status, sale_amount::text as sale, institution_id, next_follow_up_at, sold_by, sold_at is not null as sold from crm_leads where id = $1",
        [id]
      )
    ).toEqual({ status: "SATIS_OLDU", sale: "48000.00", institution_id: inst, next_follow_up_at: null, sold_by: actor, sold: true });
  });

  it("zaten ücretli kurumda lisansa dokunulmaz; kurumsal (VKN) profil yazılır", async () => {
    const actor = await h().newUser("satis2@edorasapp.ai");
    const inst = await newId();
    await db.query(ENROLL, [inst, "Ücretli Kolej", "UCRETLI", "Ayşe Yılmaz", "+905321234567", "ayse@kurum.test", ADDRESS, TCKN, null, null, todayIso(), 30000]);
    const id = await lead("Ücretli Kolej", { institution_id: inst });
    const { r } = await h().one<{ r: { licenseId: string | null; converted: boolean } }>(SALE, [
      id, inst, 30000, ADDRESS, null, VKN, "COMPANY", "Kolej A.Ş.", "Kadıköy", "İstanbul", "Kadıköy", "34710", "muhasebe@kolej.test",
      null, actor,
    ]);
    expect(r).toEqual({ licenseId: null, converted: false });
    expect((await h().one<{ n: number }>("select count(*)::int as n from crm_licenses where institution_id = $1", [inst])).n).toBe(1);
    expect(await h().one("select billing_type, tax_no, tc_no, tax_office from crm_institutions where institution_id = $1", [inst])).toEqual({
      billing_type: "COMPANY",
      tax_no: VKN,
      tc_no: null,
      tax_office: "Kadıköy",
    });
  });

  it("geçersiz girdiler: tutar, başka kuruma bağlı aday, kayıtsız kurum, eksik profil (transaction geri alınır)", async () => {
    const actor = await h().newUser("satis3@edorasapp.ai");
    const inst = await enrollDemo("Hatalı Satış");
    const id = await lead("Hatalı Satış");
    expect(await h().failure(SALE, personSale(id, inst, 0, actor))).toMatch(/CRM_SALE_AMOUNT_REQUIRED/);
    expect(await h().failure(SALE, personSale(id, inst, 100, null))).toMatch(/CRM_SALE_INVALID/);
    expect(await h().failure(SALE, personSale(id, await newId(), 100, actor))).toMatch(/CRM_NOT_ENROLLED/);
    expect(await h().failure(SALE, personSale(await newId(), inst, 100, actor))).toMatch(/CRM_LEAD_NOT_FOUND/);
    const other = await enrollDemo("Başka Kurum");
    const linked = await lead("Bağlı", { institution_id: other });
    expect(await h().failure(SALE, personSale(linked, inst, 100, actor))).toMatch(/CRM_LEAD_ALREADY_LINKED/);
    // Profil eksik (e-posta yok) → kısıt; kurum DEMO kalır, lisans açılmaz.
    const bad = personSale(id, inst, 100, actor);
    bad[12] = null;
    expect(await h().failure(SALE, bad)).toBe("crm_institutions_billing_profile_check");
    expect(await h().one("select status from crm_institutions where institution_id = $1", [inst])).toEqual({ status: "DEMO" });
    expect((await h().one<{ n: number }>("select count(*)::int as n from crm_licenses where institution_id = $1", [inst])).n).toBe(0);
  });

  it("satıştaki adayın tutarı silinemez; satıştan çıkış ve geri dönüş (hesap açık) serbest", async () => {
    const actor = await h().newUser("satis4@edorasapp.ai");
    const inst = await enrollDemo("Geri Dönüş");
    const id = await lead("Geri Dönüş");
    await db.query(SALE, personSale(id, inst, 1000, actor));
    expect(await h().failure("update crm_leads set sale_amount = 0 where id = $1", [id])).toMatch(/CRM_SALE_AMOUNT_REQUIRED/);
    expect(await h().failure("update crm_leads set status = 'TAKIPTE', sold_at = null where id = $1", [id])).toBeNull();
    expect(await h().failure("update crm_leads set status = 'SATIS_OLDU', sold_at = current_date where id = $1", [id])).toBeNull();
  });
});

describe("yetkiler", () => {
  it("fonksiyonlar PUBLIC / anon / authenticated'a açık değil", async () => {
    for (const fn of [
      "public.crm_leads_sale_rules()",
      "public.crm_record_lead_sale(uuid, uuid, numeric, text, text, text, text, text, text, text, text, text, text, text, uuid)",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        const r = await h().one<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]);
        expect(r.ok).toBe(false);
      }
    }
  });
});
