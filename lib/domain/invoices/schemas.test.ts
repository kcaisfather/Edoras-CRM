import { describe, expect, it } from "vitest";
import { createInvoiceSchema, invoiceListQuerySchema, paymentListQuerySchema } from "./schemas";

const ID = "8a1d7a54-1d1c-4b8e-9d55-0f2f0a6b7c11";
const OTHER = "0b9c1a2e-3d4f-4a5b-8c6d-7e8f9a0b1c2d";

const base = {
  institutionId: ID,
  licenseId: OTHER,
  mode: "EMAIL" as const,
  amount: 45000,
  vatRate: 20,
  vatIncluded: true,
  description: "Edoras yıllık lisans bedeli",
  issueDate: "2026-09-29",
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => i.path.join("."));
}

describe("createInvoiceSchema", () => {
  it("e-posta talebi geçerli", () => {
    expect(createInvoiceSchema.safeParse(base).success).toBe(true);
  });

  it("ödeme ya da lisans olmadan reddedilir (SQL: crm_invoices_sale_ref_check)", () => {
    expect(issues(createInvoiceSchema.safeParse({ ...base, licenseId: undefined }))).toEqual(["paymentId"]);
    expect(createInvoiceSchema.safeParse({ ...base, licenseId: undefined, paymentId: OTHER }).success).toBe(true);
  });

  it("tutar > 0, KDV 0–100, geçerli tarih, açıklama", () => {
    expect(issues(createInvoiceSchema.safeParse({ ...base, amount: 0 }))).toEqual(["amount"]);
    expect(issues(createInvoiceSchema.safeParse({ ...base, amount: -1 }))).toEqual(["amount"]);
    expect(issues(createInvoiceSchema.safeParse({ ...base, vatRate: 101 }))).toEqual(["vatRate"]);
    expect(issues(createInvoiceSchema.safeParse({ ...base, vatRate: -1 }))).toEqual(["vatRate"]);
    expect(issues(createInvoiceSchema.safeParse({ ...base, issueDate: "2026-02-31" }))).toEqual(["issueDate"]);
    expect(issues(createInvoiceSchema.safeParse({ ...base, description: " " }))).toEqual(["description"]);
  });

  it("elle kayıtta numara, platformda sağlayıcı zorunlu", () => {
    expect(issues(createInvoiceSchema.safeParse({ ...base, mode: "MANUAL" }))).toEqual(["invoiceNo"]);
    expect(createInvoiceSchema.safeParse({ ...base, mode: "MANUAL", invoiceNo: "ABC2026000123" }).success).toBe(true);
    expect(issues(createInvoiceSchema.safeParse({ ...base, mode: "PROVIDER" }))).toEqual(["provider"]);
    expect(createInvoiceSchema.safeParse({ ...base, mode: "PROVIDER", provider: "PARASUT" }).success).toBe(true);
  });

  it("anahtar 8–200 karakter", () => {
    expect(issues(createInvoiceSchema.safeParse({ ...base, idempotencyKey: "kisa" }))).toEqual(["idempotencyKey"]);
    expect(createInvoiceSchema.safeParse({ ...base, idempotencyKey: "yeterince-uzun-anahtar" }).success).toBe(true);
  });
});

describe("liste sorguları", () => {
  it("geçersiz değerler yok sayılır, sayfalama sınırlanır", () => {
    const q = invoiceListQuerySchema.parse({ status: "NOPE", from: "2026-13-01", to: "2026-09-30", saleRef: "x", page: "-3", size: "9999" });
    expect(q).toEqual({ status: undefined, institutionId: undefined, from: undefined, to: "2026-09-30", saleRef: undefined, page: 0, size: 200 });
  });

  it("geçerli süzgeçler geçer", () => {
    const q = invoiceListQuerySchema.parse({ status: "FAILED", institutionId: ID.toUpperCase(), saleRef: `payment:${OTHER}`, page: "2", size: "50" });
    expect(q).toMatchObject({ status: "FAILED", institutionId: ID, saleRef: { kind: "payment", id: OTHER }, page: 2, size: 50 });
  });

  it("ödeme sorgusu: yöntem, arama kırpılır", () => {
    const q = paymentListQuerySchema.parse({ method: "HAVALE", query: `  ${"a".repeat(150)} `, from: "2026-01-01" });
    expect(q.method).toBe("HAVALE");
    expect(q.query).toHaveLength(100);
    expect(q.from).toBe("2026-01-01");
    expect(paymentListQuerySchema.parse({ method: "ÇEK" }).method).toBeUndefined();
    expect(paymentListQuerySchema.parse({}).size).toBe(20);
  });
});
