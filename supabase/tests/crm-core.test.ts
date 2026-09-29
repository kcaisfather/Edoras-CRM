/**
 * CRM çekirdeği migration testi (20260929120000_crm_core) — gerçek Postgres (PGlite), düzenek harness.ts.
 * Edoras veritabanı bu testin konusu değil (demo açmanın Edoras adımları lib/server/edoras.ts).
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addYears, isValidTckn, isValidVkn, todayIso } from "@/lib/domain/institutions/rules";
import { createTestDb, helpers } from "./harness";

const VALID_TCKN = "10000000146";
const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";

/** 9 haneye VKN kontrol hanesini ekler (isValidVkn ile aynı formül). */
function withVknCheckDigit(nine: string): string {
  for (let c = 0; c <= 9; c++) if (isValidVkn(`${nine}${c}`)) return `${nine}${c}`;
  throw new Error("kontrol hanesi bulunamadı");
}

let db: PGlite;
const one = <T,>(sql: string, params: unknown[] = []) => helpers(db).one<T>(sql, params);
const failure = (sql: string, params: unknown[] = []) => helpers(db).failure(sql, params);

const ENROLL =
  "select public.crm_enroll_institution($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12::numeric, null)";

async function newId(): Promise<string> {
  return (await one<{ id: string }>("select gen_random_uuid() as id")).id;
}

/** Demo kaydı (Edoras'ta açılmış kurumun CRM tarafı): başlangıçtan 1 yıl. */
async function enrollDemo(name: string, start = todayIso()): Promise<string> {
  const id = await newId();
  await db.query(ENROLL, [id, name, "DEMO", "Ayşe Yılmaz", "+905321234567", "ayse@kurum.test", null, null, null, start, null, null]);
  return id;
}

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("kurulum", () => {
  it("CRM tabloları anon ve authenticated rollerine kapalı", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      const err = await failure("select * from public.crm_institutions");
      await db.exec("reset role");
      expect(err).toMatch(/permission denied/);
    }
  });

  it("ilk yönetici başlıktaki SQL ile eklenir; tanımsız rol reddedilir", async () => {
    await db.query("insert into auth.users (email) values ('kurucu@edorasapp.ai')");
    await db.exec(
      "insert into public.crm_staff (user_id, role, full_name) select id, 'ADMIN', 'Kurucu' from auth.users where email = 'kurucu@edorasapp.ai'"
    );
    const row = await one<{ role: string }>("select role from public.crm_staff");
    expect(row.role).toBe("ADMIN");

    await db.query("insert into auth.users (email) values ('temsilci@edorasapp.ai')");
    expect(
      await failure(
        "insert into public.crm_staff (user_id, role) select id, 'PATRON' from auth.users where email = 'temsilci@edorasapp.ai'"
      )
    ).toBe("crm_staff_role_check");
  });
});

describe("TC / Vergi No doğrulayıcıları SQL ve TypeScript'te aynı", () => {
  it("bilinen geçerli TC", async () => {
    const row = await one<{ ok: boolean }>("select public.crm_is_valid_tckn($1) as ok", [VALID_TCKN]);
    expect(row.ok).toBe(true);
    expect(isValidTckn(VALID_TCKN)).toBe(true);
  });

  it("rastgele 2.000 değerde iki taraf aynı sonucu verir", async () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const samples: string[] = [];
    for (let i = 0; i < 1000; i++) {
      // Yarısı geçerli olacak şekilde üret: 9/10 haneye kontrol hanelerini hesaplayıp ekle.
      const nine = String(1 + Math.floor(rand() * 9)) + String(Math.floor(rand() * 1e8)).padStart(8, "0");
      const d = nine.split("").map(Number);
      const d10 = ((((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10) + 10) % 10;
      const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
      samples.push(`${nine}${d10}${d11}`);
      samples.push(String(Math.floor(rand() * 1e11)).padStart(11, "0"));
    }
    const vkns: string[] = [];
    for (let i = 0; i < 1000; i++) vkns.push(String(Math.floor(rand() * 1e10)).padStart(10, "0"));

    const tc = await db.query<{ v: string; ok: boolean }>(
      "select v, public.crm_is_valid_tckn(v) as ok from unnest($1::text[]) as v",
      [samples]
    );
    for (const r of tc.rows) expect([r.v, r.ok]).toEqual([r.v, isValidTckn(r.v)]);
    expect(tc.rows.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1000);

    const vk = await db.query<{ v: string; ok: boolean }>(
      "select v, public.crm_is_valid_vkn(v) as ok from unnest($1::text[]) as v",
      [vkns]
    );
    for (const r of vk.rows) expect([r.v, r.ok]).toEqual([r.v, isValidVkn(r.v)]);
    // Rastgele 10 hanenin ~%10'u geçerli olmalı (kontrol hanesi 10 değerden biri).
    expect(vk.rows.filter((r) => r.ok).length).toBeGreaterThan(50);
  });
});

describe("demo: 1 dönem = 1 yıl", () => {
  it("demo kaydı başlangıçtan 1 yıl sürer ve kurum adını saklar", async () => {
    const id = await enrollDemo("Deneme Koleji");
    const crm = await one<{ status: string; demo_started_at: string; demo_ends_at: string; institution_name: string }>(
      "select status, demo_started_at::text, demo_ends_at::text, institution_name from crm_institutions where institution_id = $1",
      [id]
    );
    expect(crm).toEqual({
      status: "DEMO",
      demo_started_at: todayIso(),
      demo_ends_at: addYears(todayIso(), 1),
      institution_name: "Deneme Koleji",
    });
  });

  it("bitiş tarihi başka değere çekilemez; uzatma fonksiyonu yok", async () => {
    const id = await enrollDemo("Kural Dershanesi");
    expect(
      await failure("update crm_institutions set demo_ends_at = demo_ends_at + 30 where institution_id = $1", [id])
    ).toBe("crm_institutions_demo_dates_check");
    expect(await failure("select public.crm_extend_demo($1, 7)", [id])).toMatch(/does not exist/);
  });

  it("CRM öncesi demo gerçek başlangıcıyla kaydedilir; başlangıç zorunlu", async () => {
    const id = await enrollDemo("Eski Pilot Okulu", "2025-09-15");
    const crm = await one<{ demo_ends_at: string }>("select demo_ends_at::text from crm_institutions where institution_id = $1", [id]);
    expect(crm.demo_ends_at).toBe("2026-09-15");

    expect(
      await failure(ENROLL, [await newId(), "Başlangıçsız Kurs", "DEMO", "Ali Veli", "+905321234567", "ali@kurs.test", null, null, null, null, null, null])
    ).toMatch(/CRM_DEMO_START_REQUIRED/);
  });

  it.each([
    ["contact_name", "Ayşe", "crm_institutions_contact_name_check"],
    ["contact_phone", "05321234567", "crm_institutions_contact_phone_check"],
    ["contact_email", "ayse@", "crm_institutions_contact_email_check"],
  ])("demo kaydında %s zorunlu ve geçerli olmalı", async (column, value, constraint) => {
    const id = await enrollDemo(`Kural Kurumu ${column}`);
    expect(await failure(`update crm_institutions set ${column} = $1 where institution_id = $2`, [value, id])).toBe(
      constraint
    );
    expect(await failure(`update crm_institutions set ${column} = null where institution_id = $1`, [id])).toMatch(
      /null value/
    );
  });

  it("kurum adı olmadan kayıt açılmaz; aynı kurum iki kez kaydedilmez", async () => {
    const id = await newId();
    const args = (name: string) => [id, name, "DEMO", "Ali Veli", "+905321234567", "ali@kurs.test", null, null, null, todayIso(), null, null];
    expect(await failure(ENROLL, args(" "))).toBe("crm_institutions_institution_name_check");
    await db.query(ENROLL, args("Adlı Kurs"));
    expect(await failure(ENROLL, args("Adlı Kurs"))).toMatch(/CRM_ALREADY_ENROLLED/);
  });
});

describe("ücretli hesap ve ödeme kuralı", () => {
  it("adres ve TC/VKN olmadan ücretliye geçilemez", async () => {
    const id = await enrollDemo("Faturasız Kolej");
    const convert = (address: string | null, tc: string | null) =>
      failure("select public.crm_convert_to_paid($1, $2, $3, null, '2026-10-01', 50000, null, null, null, null)", [id, address, tc]);
    expect(await convert(null, null)).toBe("crm_institutions_paid_billing_check");
    expect(await convert(ADDRESS, null)).toBe("crm_institutions_paid_billing_check");
    expect(await convert(null, VALID_TCKN)).toBe("crm_institutions_paid_billing_check");
    expect(await convert(ADDRESS, "12345678901")).toBe("crm_institutions_tc_no_check");

    const status = await one<{ status: string }>("select status from crm_institutions where institution_id = $1", [id]);
    expect(status.status).toBe("DEMO");
  });

  it("demo kurum faturası girilmeden ödeme kaydedilemez", async () => {
    const id = await enrollDemo("Ödemesiz Kurs");
    const err = await failure(
      "insert into crm_payments (institution_id, amount, paid_on, method) values ($1, 1000, current_date, 'HAVALE')",
      [id]
    );
    expect(err).toMatch(/CRM_BILLING_REQUIRED/);
  });

  it("fatura bilgisiyle ücretliye geçer: 1 yıllık lisans ve ilk ödeme", async () => {
    const id = await enrollDemo("Ücretli Lise");
    const license = await one<{ id: string }>(
      "select public.crm_convert_to_paid($1, $2, $3, null, '2026-10-01', 60000, 30000, 'HAVALE', '2026-10-02', null) as id",
      [id, ADDRESS, VALID_TCKN]
    );
    const lic = await one<{ starts_on: string; ends_on: string }>(
      "select starts_on::text, ends_on::text from crm_licenses where id = $1",
      [license.id]
    );
    expect(lic).toEqual({ starts_on: "2026-10-01", ends_on: "2027-10-01" });

    const pay = await one<{ amount: string; license_id: string }>("select amount::text, license_id from crm_payments where institution_id = $1", [id]);
    expect(pay).toEqual({ amount: "30000.00", license_id: license.id });

    // Ücretli kurumun fatura bilgisi sonradan silinemez; ikinci kez ücretliye geçirilemez.
    expect(await failure("update crm_institutions set tc_no = null where institution_id = $1", [id])).toBe(
      "crm_institutions_paid_billing_check"
    );
    expect(
      await failure("select public.crm_convert_to_paid($1, $2, $3, null, '2027-10-01', 1, null, null, null, null)", [id, ADDRESS, VALID_TCKN])
    ).toMatch(/CRM_ALREADY_PAID/);
  });

  it("lisans yenileme süren lisansın bitişinden başlar; çakışan ya da 1 yıl olmayan lisans reddedilir", async () => {
    const id = await enrollDemo("Yenileme Koleji");
    const start = todayIso();
    // Vergi No yolu (TC yerine): kontrol hanesi hesaplanmış geçerli bir VKN.
    await db.query("select public.crm_convert_to_paid($1, $2, null, $3, $4::date, 45000, null, null, null, null)", [
      id,
      ADDRESS,
      withVknCheckDigit("123456789"),
      start,
    ]);
    const renewedId = await one<{ id: string }>("select public.crm_renew_license($1, 47000, null) as id", [id]);
    const renewed = await one<{ starts_on: string; ends_on: string }>(
      "select starts_on::text, ends_on::text from crm_licenses where id = $1",
      [renewedId.id]
    );
    expect(renewed.starts_on).toBe(addYears(start, 1));
    expect(renewed.ends_on).toBe(addYears(start, 2));

    expect(
      await failure(
        "insert into crm_licenses (institution_id, starts_on, ends_on, price) values ($1, $2::date + 30, ($2::date + 30 + interval '1 year')::date, 1)",
        [id, start]
      )
    ).toMatch(/CRM_LICENSE_OVERLAP/);
    expect(
      await failure("insert into crm_licenses (institution_id, starts_on, ends_on, price) values ($1, '2040-01-01', '2040-07-01', 1)", [id])
    ).toBe("crm_licenses_one_year_check");
  });

  it("demo kuruma lisans verilemez", async () => {
    const id = await enrollDemo("Demo Lisans Kurumu");
    expect(await failure("select public.crm_renew_license($1, 1000, null)", [id])).toMatch(/CRM_NOT_PAID/);
  });

  it("29 Şubat'ta başlayan lisans 28 Şubat'ta biter (SQL ve TypeScript aynı)", async () => {
    const row = await one<{ d: string }>("select (date '2028-02-29' + interval '1 year')::date::text as d");
    expect(row.d).toBe("2029-02-28");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });

  it("lisansı olan kaydın silinmesi engellenir; demo kaydı silinebilir", async () => {
    const paid = await enrollDemo("Silinmez Kolej");
    await db.query("select public.crm_convert_to_paid($1, $2, $3, null, '2026-10-01', 1000, null, null, null, null)", [
      paid,
      ADDRESS,
      VALID_TCKN,
    ]);
    expect(await failure("delete from crm_institutions where institution_id = $1", [paid])).toBe("crm_licenses_institution_id_fkey");

    const demo = await enrollDemo("Silinir Kurs");
    await db.query("delete from crm_institutions where institution_id = $1", [demo]);
    const n = await one<{ n: number }>("select count(*)::int as n from crm_institutions where institution_id = $1", [demo]);
    expect(n.n).toBe(0);
  });
});

describe("CRM öncesi kurumu ücretli olarak kayda alma", () => {
  it("fatura bilgisi ve lisans başlangıcı zorunlu", async () => {
    const id = await newId();
    const args = (address: string | null, tc: string | null) => [
      id,
      "Eski Kurum B",
      "UCRETLI",
      "Zeynep Ak",
      "+905551112244",
      "zeynep@eski.test",
      address,
      tc,
      null,
      null,
      "2026-01-15",
      40000,
    ];
    expect(await failure(ENROLL, args(null, null))).toBe("crm_institutions_paid_billing_check");
    await db.query(ENROLL, args(ADDRESS, VALID_TCKN));
    const lic = await one<{ ends_on: string }>("select ends_on::text from crm_licenses where institution_id = $1", [id]);
    expect(lic.ends_on).toBe("2027-01-15");
  });
});
