import { describe, expect, it } from "vitest";
import {
  buildInvoiceRequestEmail,
  canRetryInvoice,
  computeVat,
  escapeHtml,
  hasActiveInvoice,
  invoiceIdempotencyKey,
  outcomeAfterMail,
  parseEmailList,
  parseSaleRef,
  primarySaleRef,
  saleRefOf,
} from "./logic";

const ID = "8a1d7a54-1d1c-4b8e-9d55-0f2f0a6b7c11";

describe("computeVat", () => {
  it("KDV dahil tutarı böler", () => {
    expect(computeVat(1200, 20, true)).toEqual({ net: 1000, vat: 200, gross: 1200 });
  });
  it("KDV hariç tutara ekler", () => {
    expect(computeVat(1000, 20, false)).toEqual({ net: 1000, vat: 200, gross: 1200 });
  });
  it("geçersiz / negatif girdi 0 sayılır", () => {
    expect(computeVat(-5, 20, true)).toEqual({ net: 0, vat: 0, gross: 0 });
    expect(computeVat(100, NaN, false)).toEqual({ net: 100, vat: 0, gross: 100 });
  });
  it("kuruş yuvarlaması net + KDV = toplam (SQL: crm_invoices_vat_sum_check ±0,01)", () => {
    for (const [amount, rate, included] of [
      [45000, 20, true],
      [999.99, 20, true],
      [1234.56, 10, true],
      [333.33, 1, false],
      [45000, 0, true],
      [7.77, 20, false],
    ] as const) {
      const { net, vat, gross } = computeVat(amount, rate, included);
      expect(Math.abs(net + vat - gross)).toBeLessThanOrEqual(0.01);
      if (included) expect(gross).toBe(amount);
    }
  });
});

describe("e-posta listesi", () => {
  it("geçerli, tekil ve küçük harf; geçersizler ayrı", () => {
    expect(parseEmailList("A@b.co, c@d.co; a@b.co  bad")).toEqual({ valid: ["a@b.co", "c@d.co"], invalid: ["bad"] });
    expect(parseEmailList("")).toEqual({ valid: [], invalid: [] });
  });
});

describe("durum kuralları", () => {
  it("yeniden deneme yalnız başarısız e-posta / sağlayıcı faturasına", () => {
    expect(canRetryInvoice({ status: "FAILED", mode: "EMAIL" })).toBe(true);
    expect(canRetryInvoice({ status: "FAILED", mode: "PROVIDER" })).toBe(true);
    expect(canRetryInvoice({ status: "FAILED", mode: "MANUAL" })).toBe(false);
    expect(canRetryInvoice({ status: "ISSUED", mode: "MANUAL" })).toBe(false);
    expect(canRetryInvoice({ status: "SENT", mode: "EMAIL" })).toBe(false);
  });

  it("mükerrer uyarısı: başarısız ve iptal edilenler sayılmaz", () => {
    expect(hasActiveInvoice([])).toBe(false);
    expect(hasActiveInvoice([{ status: "FAILED" }, { status: "CANCELLED" }])).toBe(false);
    expect(hasActiveInvoice([{ status: "FAILED" }, { status: "PENDING" }])).toBe(true);
    expect(hasActiveInvoice([{ status: "SENT" }])).toBe(true);
    expect(hasActiveInvoice([{ status: "ISSUED" }])).toBe(true);
  });

  it("e-posta sonucu: gönderildi → SENT (hata temizlenir), değil → FAILED + kod; deneme sayacı artar", () => {
    expect(outcomeAfterMail(0, { ok: true })).toEqual({ status: "SENT", error: null, attempts: 1 });
    expect(outcomeAfterMail(1, { ok: false, error: "resend:422" })).toEqual({ status: "FAILED", error: "resend:422", attempts: 2 });
    expect(outcomeAfterMail(0, { ok: false })).toEqual({ status: "FAILED", error: "mail:failed", attempts: 1 });
    expect(outcomeAfterMail(0, { ok: false, error: "x".repeat(500) }).error).toHaveLength(200);
  });
});

describe("satış referansı", () => {
  it("ayrıştırır ve geri yazar; geçersiz biçim null", () => {
    expect(parseSaleRef(`payment:${ID}`)).toEqual({ kind: "payment", id: ID });
    expect(parseSaleRef(`license:${ID.toUpperCase()}`)).toEqual({ kind: "license", id: ID });
    expect(saleRefOf({ kind: "payment", id: ID })).toBe(`payment:${ID}`);
    expect(parseSaleRef("payment:yok")).toBeNull();
    expect(parseSaleRef(`lead:${ID}`)).toBeNull();
    expect(parseSaleRef(null)).toBeNull();
  });

  it("ödeme varsa ödeme, yoksa lisans", () => {
    expect(primarySaleRef({ paymentId: ID, licenseId: "L" })).toEqual({ kind: "payment", id: ID });
    expect(primarySaleRef({ paymentId: null, licenseId: ID })).toEqual({ kind: "license", id: ID });
    expect(primarySaleRef({})).toBeNull();
  });

  it("anahtar sabit; mükerrer onayında (existingCount değişince) değişir", () => {
    const base = { saleRef: `payment:${ID}`, mode: "EMAIL" as const, amount: 100, issueDate: "2026-09-26", existingCount: 0 };
    expect(invoiceIdempotencyKey(base)).toBe(`inv:payment:${ID}:EMAIL:100.00:2026-09-26:n0`);
    expect(invoiceIdempotencyKey(base)).toBe(invoiceIdempotencyKey({ ...base }));
    expect(invoiceIdempotencyKey({ ...base, existingCount: 1 })).not.toBe(invoiceIdempotencyKey(base));
    expect(invoiceIdempotencyKey(base).length).toBeLessThanOrEqual(200);
  });
});

describe("fatura talebi e-postası", () => {
  const company = {
    type: "COMPANY" as const,
    legalName: "Deneme Koleji A.Ş.",
    taxNumber: "9876543217",
    taxOffice: "Kadıköy",
    address: "Atatürk Cad. No: 1",
    district: "Kadıköy",
    city: "İstanbul",
    email: "muhasebe@deneme.com",
  };
  const base = {
    customerName: "Deneme Koleji",
    billing: company,
    description: "Edoras yıllık lisans bedeli",
    net: 1000,
    vatRate: 20,
    vat: 200,
    gross: 1200,
    issueDate: "2026-09-26",
  };

  it("konu, VKN, vergi dairesi ve toplam", () => {
    const m = buildInvoiceRequestEmail(base);
    expect(m.subject).toBe("Fatura talebi — Deneme Koleji A.Ş. — 2026-09-26");
    expect(m.text).toContain("VKN: 9876543217");
    expect(m.text).toContain("Vergi dairesi: Kadıköy");
    expect(m.text).toContain("Adres: Atatürk Cad. No: 1, Kadıköy, İstanbul");
    expect(m.text).toMatch(/Toplam: .*1\.200,00/);
    expect(m.text).toContain("Unvan / Ad Soyad: Deneme Koleji A.Ş.");
  });

  it("konu tek satır: unvandaki satır sonları temizlenir", () => {
    const m = buildInvoiceRequestEmail({ ...base, billing: { ...company, legalName: "Deneme\r\nBcc: x@y.z Koleji" } });
    expect(m.subject).toBe("Fatura talebi — Deneme Bcc: x@y.z Koleji — 2026-09-26");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it("bireyselde TCKN yazılır, vergi dairesi yazılmaz", () => {
    const m = buildInvoiceRequestEmail({
      ...base,
      billing: { ...company, type: "INDIVIDUAL", taxNumber: "10000000146", taxOffice: null, legalName: "Deneme Koleji" },
    });
    expect(m.text).toContain("TCKN: 10000000146");
    expect(m.text).not.toContain("Vergi dairesi");
    expect(m.text).not.toContain("Unvan / Ad Soyad");
  });

  it("HTML'de kullanıcı girdisi kaçırılır (etiket enjeksiyonu yok)", () => {
    const m = buildInvoiceRequestEmail({ ...base, description: '<img src=x onerror="alert(1)">', note: "a & b <script>" });
    expect(m.html).not.toContain("<img");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(m.html).toContain("a &amp; b &lt;script&gt;");
    expect(m.text).toContain("Not: a & b <script>");
    expect(escapeHtml(`'"<>&`)).toBe("&#39;&quot;&lt;&gt;&amp;");
  });
});
