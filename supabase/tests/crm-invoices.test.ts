/**
 * 20260929200000_crm_invoices — fatura profili sütunları, crm_invoices ve kısıtları (PGlite, düzenek harness.ts).
 * Mevcut satırlar (DEMO, eski ücretli) yeni kurallardan etkilenmez.
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
const one = <T,>(sql: string, params: unknown[] = []) => helpers(db).one<T>(sql, params);
const failure = (sql: string, params: unknown[] = []) => helpers(db).failure(sql, params);

const ENROLL =
  "select public.crm_enroll_institution($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12::numeric, null)";

async function newId(): Promise<string> {
  return (await one<{ id: string }>("select gen_random_uuid() as id")).id;
}

async function enrollDemo(name: string): Promise<string> {
  const id = await newId();
  await db.query(ENROLL, [id, name, "DEMO", "Ayşe Yılmaz", "+905321234567", "ayse@kurum.test", null, null, null, todayIso(), null, null]);
  return id;
}

/** Ücretli kurum (eski biçim: adres + TC, profil sütunları null) + lisans. */
async function enrollPaid(name: string, taxNo: string | null = null): Promise<{ institutionId: string; licenseId: string }> {
  const institutionId = await newId();
  await db.query(ENROLL, [
    institutionId, name, "UCRETLI", "Ayşe Yılmaz", "+905321234567", "ayse@kurum.test",
    ADDRESS, taxNo ? null : TCKN, taxNo, null, "2026-10-01", 45000,
  ]);
  const lic = await one<{ id: string }>("select id from crm_licenses where institution_id = $1", [institutionId]);
  return { institutionId, licenseId: lic.id };
}

async function addPayment(institutionId: string, licenseId: string | null = null, amount = 12000): Promise<string> {
  return (
    await one<{ id: string }>(
      "insert into crm_payments (institution_id, license_id, amount, paid_on, method) values ($1, $2, $3, '2026-10-02', 'HAVALE') returning id",
      [institutionId, licenseId, amount]
    )
  ).id;
}

interface InvoiceArgs {
  institutionId: string;
  paymentId?: string | null;
  licenseId?: string | null;
  mode?: string;
  provider?: string | null;
  recipients?: string[];
  amount?: number;
  net?: number;
  vatRate?: number;
  vat?: number;
  status?: string;
  invoiceNo?: string | null;
  error?: string | null;
  issuedAt?: string | null;
  key?: string;
  pdfUrl?: string | null;
}

let keySeq = 0;
const INSERT = `insert into crm_invoices
  (institution_id, payment_id, license_id, customer_name, mode, provider, recipient_emails, amount, net_amount, vat_rate,
   vat_amount, description, issue_date, status, invoice_no, error, issued_at, idempotency_key, pdf_url)
  values ($1, $2, $3, 'Örnek Kolej A.Ş.', $4, $5, $6::text[], $7, $8, $9, $10, 'Edoras yıllık lisans bedeli', '2026-10-05', $11, $12, $13, $14, $15, $16)
  returning id`;

function invoice(a: InvoiceArgs) {
  return db.query<{ id: string }>(INSERT, [
    a.institutionId, a.paymentId ?? null, a.licenseId ?? null, a.mode ?? "EMAIL", a.provider ?? null,
    a.recipients ?? ["muhasebe@ornek.com"], a.amount ?? 1200, a.net ?? 1000, a.vatRate ?? 20, a.vat ?? 200,
    a.status ?? "SENT", a.invoiceNo ?? null, a.error ?? null, a.issuedAt ?? null,
    a.key ?? `test-key-${++keySeq}-abcdefgh`, a.pdfUrl ?? null,
  ]);
}

const fail = (a: InvoiceArgs) => failure(INSERT, [
  a.institutionId, a.paymentId ?? null, a.licenseId ?? null, a.mode ?? "EMAIL", a.provider ?? null,
  a.recipients ?? ["muhasebe@ornek.com"], a.amount ?? 1200, a.net ?? 1000, a.vatRate ?? 20, a.vat ?? 200,
  a.status ?? "SENT", a.invoiceNo ?? null, a.error ?? null, a.issuedAt ?? null,
  a.key ?? `test-key-${++keySeq}-abcdefgh`, a.pdfUrl ?? null,
]);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("mevcut satırlar geçerli kalır", () => {
  it("DEMO kurum yeni sütunlar olmadan durur; eski ücretli kurumda tür boş, adres + TC geçerli", async () => {
    const demo = await enrollDemo("Bakırköy Demo");
    const paid = await enrollPaid("Eski Ücretli");
    const rows = await db.query<{ institution_id: string; billing_type: string | null; legal_name: string | null }>(
      "select institution_id, billing_type, legal_name from crm_institutions where institution_id = any($1::uuid[])",
      [[demo, paid.institutionId]]
    );
    expect(rows.rows).toHaveLength(2);
    for (const r of rows.rows) expect(r.billing_type).toBeNull();
  });

  it("yeni sütun eklemek eski kuralları bozmaz: ücretli kurum yine adres + TC/VKN ister", async () => {
    const id = await enrollDemo("Kural Demo");
    expect(await failure("update crm_institutions set status = 'UCRETLI' where institution_id = $1", [id])).toBe(
      "crm_institutions_paid_billing_check"
    );
  });
});

describe("fatura profili kısıtları", () => {
  const PROFILE_PERSON = `update crm_institutions set billing_type = 'INDIVIDUAL', legal_name = 'Ayşe Yılmaz',
    billing_city = 'İstanbul', billing_district = 'Bakırköy', billing_email = 'ayse@kurum.test' where institution_id = $1`;

  it("bireysel tam profil (TC) kaydedilir; e-Fatura alanı bilinmiyor (null) kalır", async () => {
    const { institutionId } = await enrollPaid("Bireysel Kurs");
    await db.query(PROFILE_PERSON, [institutionId]);
    const row = await one<{ billing_type: string; e_invoice_registered: boolean | null }>(
      "select billing_type, e_invoice_registered from crm_institutions where institution_id = $1",
      [institutionId]
    );
    expect(row).toEqual({ billing_type: "INDIVIDUAL", e_invoice_registered: null });
  });

  it("kurumsal profil VKN + vergi dairesi ister", async () => {
    const { institutionId } = await enrollPaid("Şirket Kolej", VKN);
    const base = `update crm_institutions set billing_type = 'COMPANY', legal_name = 'Şirket Kolej A.Ş.',
      billing_city = 'İstanbul', billing_district = 'Kadıköy', billing_email = 'muhasebe@sirket.test'`;
    expect(await failure(`${base} where institution_id = $1`, [institutionId])).toBe("crm_institutions_billing_profile_check");
    await db.query(`${base}, tax_office = 'Kadıköy' where institution_id = $1`, [institutionId]);
  });

  it("TC ⇔ INDIVIDUAL, VKN ⇔ COMPANY: uyumsuz tür reddedilir", async () => {
    const person = await enrollPaid("TC'li Kurum");
    const company = await enrollPaid("VKN'li Kurum", VKN);
    const common = `legal_name = 'Ad Soyad', billing_city = 'İstanbul', billing_district = 'Kadıköy', billing_email = 'a@b.co'`;
    // TC kayıtlı kurum COMPANY olamaz (vergi dairesi verilse bile).
    expect(
      await failure(`update crm_institutions set billing_type = 'COMPANY', ${common}, tax_office = 'Kadıköy' where institution_id = $1`, [person.institutionId])
    ).toMatch(/crm_institutions_(billing_profile|tax_office_vkn)_check/);
    // VKN kayıtlı kurum INDIVIDUAL olamaz.
    expect(
      await failure(`update crm_institutions set billing_type = 'INDIVIDUAL', ${common} where institution_id = $1`, [company.institutionId])
    ).toBe("crm_institutions_billing_profile_check");
    // Tür INDIVIDUAL iken sonradan VKN eklenemez.
    await db.query(`update crm_institutions set billing_type = 'INDIVIDUAL', ${common} where institution_id = $1`, [person.institutionId]);
    expect(await failure("update crm_institutions set tax_no = $2 where institution_id = $1", [person.institutionId, VKN])).toBe(
      "crm_institutions_billing_profile_check"
    );
  });

  it("vergi dairesi yalnız VKN ile", async () => {
    const { institutionId } = await enrollPaid("TC + vergi dairesi");
    expect(await failure("update crm_institutions set tax_office = 'Kadıköy' where institution_id = $1", [institutionId])).toBe(
      "crm_institutions_tax_office_vkn_check"
    );
  });

  it("profil alanları doluysa biçimli olur: tür, posta kodu, e-posta, kısa metin", async () => {
    const { institutionId } = await enrollPaid("Biçim Kursu");
    const set = (col: string, value: string) => failure(`update crm_institutions set ${col} = $2 where institution_id = $1`, [institutionId, value]);
    expect(await set("billing_type", "ANONIM")).toMatch(/crm_institutions_billing_(type|profile)_check/);
    expect(await set("postal_code", "3400")).toBe("crm_institutions_postal_code_check");
    expect(await set("billing_email", "yok")).toBe("crm_institutions_billing_email_check");
    expect(await set("billing_city", "İ")).toBe("crm_institutions_billing_text_check");
    await db.query("update crm_institutions set postal_code = '34158', billing_email = 'fatura@kurs.test' where institution_id = $1", [institutionId]);
  });

  it("tür boş kalan eski satırda kimlik türü değişebilir (profil tamamlanana dek)", async () => {
    const { institutionId } = await enrollPaid("Eski Kimlik");
    await db.query("update crm_institutions set tc_no = null, tax_no = $2 where institution_id = $1", [institutionId, VKN]);
  });
});

describe("crm_convert_to_paid: kimlik değişince profil tutarlı kalır", () => {
  it("profili dolu DEMO kurum başka kimlik türüyle ücretliye geçebilir; tür boşalır, vergi dairesi temizlenir", async () => {
    const id = await enrollDemo("Profilli Demo");
    // Demo iken VKN'li kurumsal profil kaydedilir (adres + kimlik + profil).
    await db.query(
      `update crm_institutions set address = $2, tax_no = $3, billing_type = 'COMPANY', legal_name = 'Profilli A.Ş.',
         tax_office = 'Kadıköy', billing_city = 'İstanbul', billing_district = 'Kadıköy', billing_email = 'a@b.co' where institution_id = $1`,
      [id, ADDRESS, VKN]
    );
    // Dönüşüm formu yalnız adres + TC gönderir (tür/vergi dairesini bilmez).
    await db.query(
      "select public.crm_convert_to_paid($1, $2, $3, null, '2026-10-01', 50000, null, null, null, null)",
      [id, ADDRESS, TCKN]
    );
    const row = await one<{ status: string; billing_type: string | null; tax_office: string | null; tc_no: string }>(
      "select status, billing_type, tax_office, tc_no from crm_institutions where institution_id = $1",
      [id]
    );
    expect(row).toEqual({ status: "UCRETLI", billing_type: null, tax_office: null, tc_no: TCKN });
  });
});

describe("crm_invoices: kurum ve satış kuralları", () => {
  it("DEMO (adres + TC/VKN yok) kuruma fatura açılamaz — kurum kaydı varsa da", async () => {
    const id = await enrollDemo("Faturasız Demo");
    // Ödeme referansı bile kurulamaz (crm_payments de aynı kuralı ister); lisans da yalnız ücretliye.
    expect(await failure("insert into crm_payments (institution_id, amount, paid_on, method) values ($1, 100, current_date, 'NAKIT')", [id])).toMatch(/CRM_BILLING_REQUIRED/);
    expect(await failure("insert into crm_licenses (institution_id, starts_on, ends_on, price) values ($1, '2026-10-01', '2027-10-01', 1)", [id])).toMatch(/CRM_NOT_PAID/);
  });

  it("fatura tetikleyicisi fatura bilgisi eksik kuruma fatura açmaz (doğrudan sınama)", async () => {
    const { institutionId, licenseId } = await enrollPaid("Bilgisi Silinen Kurum");
    // Tablo kısıtı adresi silmeye izin vermez; bu yüzden tetikleyici mantığı, satış referansı başka kuruma ait olunca sınanır.
    const other = await enrollPaid("Başka Kurum");
    expect(await fail({ institutionId, licenseId: other.licenseId })).toMatch(/CRM_INVOICE_SALE_MISMATCH/);
    const otherPayment = await addPayment(other.institutionId, other.licenseId);
    expect(await fail({ institutionId, paymentId: otherPayment })).toMatch(/CRM_INVOICE_SALE_MISMATCH/);
    await invoice({ institutionId, licenseId });
  });

  it("en az bir satış referansı (ödeme ya da lisans) gerekir", async () => {
    const { institutionId, licenseId } = await enrollPaid("Referanssız");
    expect(await fail({ institutionId })).toBe("crm_invoices_sale_ref_check");
    const payment = await addPayment(institutionId, licenseId);
    await invoice({ institutionId, paymentId: payment });
    await invoice({ institutionId, paymentId: payment, licenseId });
  });

  it("aynı satışa ikinci fatura sert engel değil (uyarı ekranda); aynı anahtar ikinci satır olmaz", async () => {
    const { institutionId, licenseId } = await enrollPaid("Çift Faturalı");
    await invoice({ institutionId, licenseId, key: "same-sale-key-1" });
    await invoice({ institutionId, licenseId, key: "same-sale-key-2" });
    expect(await fail({ institutionId, licenseId, key: "same-sale-key-1" })).toBe("crm_invoices_idempotency_key_key");
    const n = await one<{ n: number }>("select count(*)::int as n from crm_invoices where institution_id = $1", [institutionId]);
    expect(n.n).toBe(2);
  });
});

describe("crm_invoices: tutar ve alan kısıtları", () => {
  let ids: { institutionId: string; licenseId: string };
  beforeAll(async () => {
    ids = await enrollPaid("Tutar Kolej");
  });

  it("KDV dahil tutar = net + KDV (±0,01)", async () => {
    await invoice({ ...ids, amount: 1200, net: 1000, vat: 200 });
    await invoice({ ...ids, amount: 1200, net: 1000, vat: 200.01 });
    expect(await fail({ ...ids, amount: 1200, net: 1000, vat: 199 })).toBe("crm_invoices_vat_sum_check");
    expect(await fail({ ...ids, amount: 1200, net: 1000, vat: 200.02 })).toBe("crm_invoices_vat_sum_check");
  });

  it("tutar > 0; KDV oranı 0–100", async () => {
    expect(await fail({ ...ids, amount: 0, net: 0, vat: 0 })).toBe("crm_invoices_amount_check");
    expect(await fail({ ...ids, amount: -5, net: -5, vat: 0 })).toBe("crm_invoices_amount_check");
    await invoice({ ...ids, amount: 100, net: 100, vat: 0, vatRate: 0 });
    expect(await fail({ ...ids, vatRate: 101 })).toBe("crm_invoices_vat_rate_check");
    expect(await fail({ ...ids, vatRate: -1 })).toBe("crm_invoices_vat_rate_check");
  });

  it("yöntem ve sağlayıcı tutarlı: PROVIDER ⇔ sağlayıcı", async () => {
    expect(await fail({ ...ids, mode: "SMS" })).toBe("crm_invoices_mode_check");
    expect(await fail({ ...ids, mode: "PROVIDER", provider: null, status: "PENDING" })).toBe("crm_invoices_provider_check");
    expect(await fail({ ...ids, mode: "EMAIL", provider: "PARASUT" })).toBe("crm_invoices_provider_check");
    expect(await fail({ ...ids, mode: "PROVIDER", provider: "KOLAYFATURA", status: "PENDING" })).toBe("crm_invoices_provider_check");
    await invoice({ ...ids, mode: "PROVIDER", provider: "PARASUT", status: "PENDING" });
  });

  it("EMAIL yönteminde en az bir alıcı; en çok 5", async () => {
    expect(await fail({ ...ids, mode: "EMAIL", recipients: [] })).toBe("crm_invoices_recipients_check");
    expect(await fail({ ...ids, recipients: ["a@b.co", "b@b.co", "c@b.co", "d@b.co", "e@b.co", "f@b.co"] })).toBe("crm_invoices_recipients_check");
  });

  it("durum ↔ alan: ISSUED numara + an ister; SENT yalnız EMAIL; FAILED hata kodu ister", async () => {
    expect(await fail({ ...ids, mode: "PROVIDER", provider: "PARASUT", status: "ISSUED" })).toBe("crm_invoices_state_check");
    await invoice({ ...ids, mode: "PROVIDER", provider: "PARASUT", status: "ISSUED", invoiceNo: "EDR2026000001", issuedAt: "2026-10-05T10:00:00Z" });
    expect(await fail({ ...ids, mode: "PROVIDER", provider: "PARASUT", status: "SENT" })).toBe("crm_invoices_state_check");
    expect(await fail({ ...ids, status: "FAILED" })).toBe("crm_invoices_state_check");
    await invoice({ ...ids, status: "FAILED", error: "resend:422" });
    expect(await fail({ ...ids, status: "NOPE" })).toBe("crm_invoices_status_check");
  });

  it("elle kayıt (MANUAL) daima numaralı ve kesilmiş; alıcı gerekmez", async () => {
    expect(await fail({ ...ids, mode: "MANUAL", recipients: [], status: "PENDING" })).toBe("crm_invoices_state_check");
    expect(await fail({ ...ids, mode: "MANUAL", recipients: [], status: "ISSUED", issuedAt: "2026-10-05T10:00:00Z" })).toBe("crm_invoices_state_check");
    await invoice({ ...ids, mode: "MANUAL", recipients: [], status: "ISSUED", invoiceNo: "ABC2026000123", issuedAt: "2026-10-05T10:00:00Z" });
  });

  it("PDF adresi yalnız https; para birimi TRY", async () => {
    expect(await fail({ ...ids, pdfUrl: "javascript:alert(1)" })).toBe("crm_invoices_text_check");
    await invoice({ ...ids, pdfUrl: "https://ornek.com/f.pdf" });
    expect(await failure("update crm_invoices set currency = 'USD' where institution_id = $1", [ids.institutionId])).toBe("crm_invoices_currency_check");
  });
});

describe("crm_invoices: değişmezlik ve durum geçişi", () => {
  it("başarısız fatura yeniden denenince durum / deneme güncellenir; tutar ve satış değişmez", async () => {
    const { institutionId, licenseId } = await enrollPaid("Yeniden Deneme");
    const created = await invoice({ institutionId, licenseId, status: "FAILED", error: "resend:500" });
    const id = created.rows[0].id;
    await db.query("update crm_invoices set status = 'SENT', error = null, attempts = attempts + 1 where id = $1", [id]);
    const row = await one<{ status: string; attempts: number }>("select status, attempts from crm_invoices where id = $1", [id]);
    expect(row).toEqual({ status: "SENT", attempts: 1 });
    expect(await failure("update crm_invoices set amount = 999, net_amount = 832.5, vat_amount = 166.5 where id = $1", [id])).toMatch(/CRM_INVOICE_IMMUTABLE/);
    expect(await failure("update crm_invoices set license_id = null where id = $1", [id])).toMatch(/CRM_INVOICE_SALE_MISMATCH|CRM_INVOICE_IMMUTABLE|crm_invoices_sale_ref_check/);
  });

  it("ödemesi olan fatura ödeme silinmeden önce korunur (restrict)", async () => {
    const { institutionId, licenseId } = await enrollPaid("Korumalı Ödeme");
    const payment = await addPayment(institutionId, licenseId);
    await invoice({ institutionId, paymentId: payment });
    expect(await failure("delete from crm_payments where id = $1", [payment])).toBe("crm_invoices_payment_id_fkey");
  });
});

describe("yetkiler", () => {
  it("crm_invoices anon ve authenticated rollerine kapalı; service_role okur ve yazar", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      const err = await failure("select * from public.crm_invoices");
      await db.exec("reset role");
      expect(err).toMatch(/permission denied/);
    }
    await db.exec("set role service_role");
    const err = await failure("select count(*) from public.crm_invoices");
    await db.exec("reset role");
    expect(err).toBeNull();
  });
});
