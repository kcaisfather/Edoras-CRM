/**
 * 20261005190000_crm_license_pricing — liste fiyatı (tek satır), lisansta indirim yüzdesi ve faturası kesilmiş
 * lisans / ödemenin düzeltme koruması (PGlite, düzenek harness.ts).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

const TCKN = "10000000146";
const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";
const ENROLL =
  "select public.crm_enroll_institution($1::uuid, $2, 'UCRETLI', 'Ayşe Yılmaz', '+905321234567', 'ayse@kurum.test', $3, $4, null, null, $5::date, $6::numeric, null)";

let db: PGlite;
const one = <T,>(sql: string, params: unknown[] = []) => helpers(db).one<T>(sql, params);
const failure = (sql: string, params: unknown[] = []) => helpers(db).failure(sql, params);

let seq = 0;
async function enrollPaid(price = 45000): Promise<{ institutionId: string; licenseId: string }> {
  const institutionId = (await one<{ id: string }>("select gen_random_uuid() as id")).id;
  await db.query(ENROLL, [institutionId, `Ücretli Kurum ${++seq}`, ADDRESS, TCKN, "2026-10-01", price]);
  const lic = await one<{ id: string }>("select id from crm_licenses where institution_id = $1", [institutionId]);
  return { institutionId, licenseId: lic.id };
}

async function addPayment(institutionId: string, licenseId: string | null = null): Promise<string> {
  return (
    await one<{ id: string }>(
      "insert into crm_payments (institution_id, license_id, amount, paid_on, method) values ($1, $2, 15000, '2026-10-02', 'HAVALE') returning id",
      [institutionId, licenseId]
    )
  ).id;
}

async function addInvoice(institutionId: string, ref: { paymentId?: string; licenseId?: string }, status = "SENT"): Promise<string> {
  return (
    await one<{ id: string }>(
      `insert into crm_invoices
         (institution_id, payment_id, license_id, customer_name, mode, recipient_emails, amount, net_amount, vat_rate,
          vat_amount, description, issue_date, status, idempotency_key)
       values ($1, $2, $3, 'Örnek Kolej A.Ş.', 'EMAIL', array['muhasebe@ornek.com'], 1200, 1000, 20, 200,
               'Edoras yıllık lisans bedeli', '2026-10-05', $4, $5)
       returning id`,
      [institutionId, ref.paymentId ?? null, ref.licenseId ?? null, status, `pricing-test-${++seq}-abcdefgh`]
    )
  ).id;
}

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("liste fiyatı (tek satır)", () => {
  it("satır hazır gelir, başlangıçta boştur; pozitif olmalı; ikinci satır açılamaz", async () => {
    expect(await one<{ list_price: string | null }>("select list_price from crm_license_pricing where id = 1")).toEqual({ list_price: null });
    await db.query("update crm_license_pricing set list_price = 45000 where id = 1");
    expect(await failure("update crm_license_pricing set list_price = 0 where id = 1")).toBe("crm_license_pricing_list_price_check");
    expect(await failure("insert into crm_license_pricing (id, list_price) values (2, 100)")).toBe("crm_license_pricing_singleton_check");
  });
});

describe("lisansta indirim", () => {
  it("eski satır ve elle bedel: liste ve yüzde boş kalabilir", async () => {
    const { licenseId } = await enrollPaid(29950);
    const row = await one<{ list_price: string | null; discount_percent: string | null }>(
      "select list_price, discount_percent from crm_licenses where id = $1",
      [licenseId]
    );
    expect(row).toEqual({ list_price: null, discount_percent: null });
  });

  it("yüzde doluysa bedel liste × (100 − yüzde) / 100 olmalı (kuruşa yuvarlı)", async () => {
    const { licenseId } = await enrollPaid();
    await db.query("update crm_licenses set list_price = 45000, discount_percent = 10, price = 40500 where id = $1", [licenseId]);
    await db.query("update crm_licenses set list_price = 29999, discount_percent = 12.5, price = 26249.13 where id = $1", [licenseId]);
    expect(await failure("update crm_licenses set list_price = 45000, discount_percent = 10, price = 40000 where id = $1", [licenseId])).toBe(
      "crm_licenses_discount_check"
    );
    expect(await failure("update crm_licenses set list_price = null, discount_percent = 10 where id = $1", [licenseId])).toBe(
      "crm_licenses_discount_check"
    );
    expect(await failure("update crm_licenses set list_price = 45000, discount_percent = 101, price = 0 where id = $1", [licenseId])).toBe(
      "crm_licenses_discount_check"
    );
    expect(await failure("update crm_licenses set list_price = 0, discount_percent = null where id = $1", [licenseId])).toBe(
      "crm_licenses_list_price_check"
    );
  });

  it("başlangıç değişince bitiş de +1 yıl olmalı (mevcut kural)", async () => {
    const { licenseId } = await enrollPaid();
    await db.query("update crm_licenses set starts_on = '2026-09-15', ends_on = '2027-09-15' where id = $1", [licenseId]);
    expect(await failure("update crm_licenses set starts_on = '2026-09-10' where id = $1", [licenseId])).toBe("crm_licenses_one_year_check");
  });
});

describe("faturası kesilmiş satış düzeltilemez", () => {
  it("faturalı lisansın bedeli / tarihi değişmez; not ve indirim etiketi bedel aynıysa değişebilir", async () => {
    const { institutionId, licenseId } = await enrollPaid(45000);
    await addInvoice(institutionId, { licenseId });
    expect(await failure("update crm_licenses set price = 40000 where id = $1", [licenseId])).toMatch(/CRM_SALE_INVOICED/);
    expect(await failure("update crm_licenses set starts_on = '2026-09-15', ends_on = '2027-09-15' where id = $1", [licenseId])).toMatch(
      /CRM_SALE_INVOICED/
    );
    await db.query("update crm_licenses set note = 'düzeltme' where id = $1", [licenseId]);
  });

  it("faturası iptal edilmiş lisans düzeltilebilir", async () => {
    const { institutionId, licenseId } = await enrollPaid(45000);
    await addInvoice(institutionId, { licenseId }, "CANCELLED");
    await db.query("update crm_licenses set list_price = 45000, discount_percent = 20, price = 36000 where id = $1", [licenseId]);
  });

  it("faturalı ödemenin tutarı / tarihi / yöntemi değişmez, silinmez; notu değişebilir", async () => {
    const { institutionId, licenseId } = await enrollPaid();
    const paymentId = await addPayment(institutionId, licenseId);
    await addInvoice(institutionId, { paymentId });
    expect(await failure("update crm_payments set amount = 1 where id = $1", [paymentId])).toMatch(/CRM_SALE_INVOICED/);
    expect(await failure("update crm_payments set paid_on = '2026-10-03' where id = $1", [paymentId])).toMatch(/CRM_SALE_INVOICED/);
    expect(await failure("update crm_payments set method = 'NAKIT' where id = $1", [paymentId])).toMatch(/CRM_SALE_INVOICED/);
    expect(await failure("update crm_payments set license_id = null where id = $1", [paymentId])).toMatch(/CRM_SALE_INVOICED/);
    expect(await failure("delete from crm_payments where id = $1", [paymentId])).toMatch(/CRM_SALE_INVOICED/);
    await db.query("update crm_payments set note = 'açıklama' where id = $1", [paymentId]);
  });

  it("faturasız ödeme düzeltilir ve silinir; iptal faturalı ödeme düzeltilir ama FK silmeyi engeller", async () => {
    const { institutionId, licenseId } = await enrollPaid();
    const free = await addPayment(institutionId, licenseId);
    await db.query("update crm_payments set amount = 14950, method = 'NAKIT', paid_on = '2026-10-04' where id = $1", [free]);
    await db.query("delete from crm_payments where id = $1", [free]);
    expect(await one<{ n: number }>("select count(*)::int as n from crm_payments where id = $1", [free])).toEqual({ n: 0 });

    const cancelled = await addPayment(institutionId, licenseId);
    await addInvoice(institutionId, { paymentId: cancelled }, "CANCELLED");
    await db.query("update crm_payments set amount = 14000 where id = $1", [cancelled]);
    expect(await failure("delete from crm_payments where id = $1", [cancelled])).toBe("crm_invoices_payment_id_fkey");
  });
});

describe("bağlı adayın satış tutarı lisans bedeliyle birlikte düzelir (CRM satış / açık bakiye)", () => {
  /** Satış oldu adayı kuruma bağlar (fatura profili tam: satış kuralları bunu ister). */
  async function soldLead(institutionId: string, saleAmount: number, status = "SATIS_OLDU"): Promise<string> {
    await db.query(
      `update crm_institutions set billing_type = 'INDIVIDUAL', legal_name = 'Ayşe Yılmaz', billing_city = 'İstanbul',
         billing_district = 'Bakırköy', billing_email = 'fatura@kurum.test' where institution_id = $1`,
      [institutionId]
    );
    return (
      await one<{ id: string }>(
        `insert into crm_leads (organization_name, status, sale_amount, offer_amount, institution_id, sold_at)
         values ('Satış Kurumu', $1, $2, $2, $3, case when $1 = 'SATIS_OLDU' then current_date end) returning id`,
        [status, saleAmount, institutionId]
      )
    ).id;
  }
  const saleOf = async (leadId: string) =>
    Number((await one<{ sale_amount: string }>("select sale_amount from crm_leads where id = $1", [leadId])).sale_amount);

  it("satış tutarı eski bedele eşitse yeni bedele çekilir", async () => {
    const { institutionId, licenseId } = await enrollPaid(29950);
    const lead = await soldLead(institutionId, 29950);
    await db.query("update crm_licenses set list_price = 29950, discount_percent = 10, price = 26955 where id = $1", [licenseId]);
    expect(await saleOf(lead)).toBe(26955);
  });

  it("satış tutarı bedelden farklıysa (ör. çok lisanslı satış) ya da aday satışta değilse dokunulmaz", async () => {
    const a = await enrollPaid(29950);
    const leadA = await soldLead(a.institutionId, 50000);
    await db.query("update crm_licenses set price = 25000 where id = $1", [a.licenseId]);
    expect(await saleOf(leadA)).toBe(50000);

    const b = await enrollPaid(29950);
    const leadB = await soldLead(b.institutionId, 29950, "TAKIPTE");
    await db.query("update crm_licenses set price = 25000 where id = $1", [b.licenseId]);
    expect(await saleOf(leadB)).toBe(29950);
  });

  it("bedel 0'a düşerse satış tutarı korunur (satış tutarı > 0 kuralı)", async () => {
    const { institutionId, licenseId } = await enrollPaid(29950);
    const lead = await soldLead(institutionId, 29950);
    await db.query("update crm_licenses set price = 0 where id = $1", [licenseId]);
    expect(await saleOf(lead)).toBe(29950);
  });
});
