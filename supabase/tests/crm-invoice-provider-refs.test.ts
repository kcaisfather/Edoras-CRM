/**
 * 20261001090000_crm_invoice_provider_refs — Paraşüt satış faturası / iş kimlikleri (PGlite, düzenek harness.ts).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayIso } from "@/lib/domain/institutions/rules";
import { createTestDb, helpers } from "./harness";

const TCKN = "10000000146";
const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";

let db: PGlite;
const one = <T,>(sql: string, params: unknown[] = []) => helpers(db).one<T>(sql, params);
const failure = (sql: string, params: unknown[] = []) => helpers(db).failure(sql, params);

const ENROLL =
  "select public.crm_enroll_institution($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12::numeric, null)";

let institutionId: string;
let licenseId: string;
let keySeq = 0;

const INSERT = `insert into crm_invoices
  (institution_id, license_id, customer_name, mode, provider, recipient_emails, amount, net_amount, vat_rate, vat_amount,
   description, issue_date, status, error, idempotency_key, provider_ref, provider_job)
  values ($1, $2, 'Örnek Kolej A.Ş.', $3, $4, $5::text[], 1200, 1000, 20, 200, 'Edoras yıllık lisans bedeli', '2026-10-05',
          'PENDING', null, $6, $7, $8)
  returning id`;

function params(mode: string, ref: string | null, job: string | null): unknown[] {
  return [
    institutionId, licenseId, mode, mode === "PROVIDER" ? "PARASUT" : null,
    mode === "EMAIL" ? ["muhasebe@ornek.com"] : [], `ref-key-${++keySeq}-abcdefgh`, ref, job,
  ];
}

beforeAll(async () => {
  db = await createTestDb();
  institutionId = (await one<{ id: string }>("select gen_random_uuid() as id")).id;
  await db.query(ENROLL, [
    institutionId, "Referans Kolej", "UCRETLI", "Ayşe Yılmaz", "+905321234567", "ayse@kurum.test",
    ADDRESS, TCKN, null, null, todayIso(), 45000,
  ]);
  licenseId = (await one<{ id: string }>("select id from crm_licenses where institution_id = $1", [institutionId])).id;
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("sağlayıcı referansları", () => {
  it("PROVIDER faturası satış faturası ve iş kimliğini taşır", async () => {
    const res = await db.query<{ id: string }>(INSERT, params("PROVIDER", "123456", "job_9f8e"));
    expect(res.rows).toHaveLength(1);
  });

  it("PROVIDER dışında referans olmaz", async () => {
    expect(await failure(INSERT, params("EMAIL", "123456", null))).toBe("crm_invoices_provider_refs_check");
  });

  it("satış faturası kimliği olmadan iş kimliği olmaz; biçim dışı kimlik reddedilir", async () => {
    expect(await failure(INSERT, params("PROVIDER", null, "job_1"))).toBe("crm_invoices_provider_refs_check");
    expect(await failure(INSERT, params("PROVIDER", "12 34; drop", null))).toBe("crm_invoices_provider_refs_check");
  });

  it("satış faturası kimliği bir kez yazılır: sonradan değişmez ya da silinmez, iş kimliği boşalabilir", async () => {
    const { id } = (await db.query<{ id: string }>(INSERT, params("PROVIDER", null, null))).rows[0];
    await db.query("update crm_invoices set provider_ref = '777' where id = $1", [id]);
    await db.query("update crm_invoices set provider_job = 'job_a' where id = $1", [id]);
    await db.query("update crm_invoices set provider_job = null where id = $1", [id]);
    expect(await failure("update crm_invoices set provider_ref = '778' where id = $1", [id])).toBe("CRM_INVOICE_IMMUTABLE");
    expect(await failure("update crm_invoices set provider_ref = null where id = $1", [id])).toBe("CRM_INVOICE_IMMUTABLE");
  });

  it("eski koruma kuralları sürer: tutar değişmez", async () => {
    const { id } = (await db.query<{ id: string }>(INSERT, params("PROVIDER", "555", null))).rows[0];
    expect(await failure("update crm_invoices set amount = 1300, vat_amount = 300 where id = $1", [id])).toBe(
      "CRM_INVOICE_IMMUTABLE"
    );
  });
});
