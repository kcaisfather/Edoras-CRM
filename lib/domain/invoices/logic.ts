/**
 * Fatura için saf mantık (DeepSport features/invoices/logic.ts'ten): KDV hesabı, e-posta listesi, durum kuralları,
 * mükerrer uyarısı, satış referansı ve fatura talebi e-postası. Tarayıcı ve sunucu API'si kullanmaz.
 * VKN / TCKN doğrulaması lib/domain/institutions/rules.ts'te (SQL ile birebir); fatura profili tamlığı
 * lib/domain/institutions/billing-profile.ts'te.
 */
import { normalizeEmail } from "@/lib/utils/phone";
import type { Invoice, InvoiceMode, InvoiceStatus } from "./types";

export const DEFAULT_VAT_RATE = 20;
export const VAT_RATES = [0, 1, 10, 20] as const;
/** E-posta talebinde en çok alıcı (SQL: crm_invoices_recipients_check). */
export const MAX_RECIPIENTS = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** KDV: dahil ise brütten net çıkarılır, hariç ise nete eklenir. Negatif/geçersiz tutar 0 sayılır. */
export function computeVat(amount: number, vatRate: number, vatIncluded: boolean): { net: number; vat: number; gross: number } {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const r = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
  if (vatIncluded) {
    const net = round2(a / (1 + r / 100));
    return { net, vat: round2(a - net), gross: round2(a) };
  }
  const vat = round2((a * r) / 100);
  return { net: round2(a), vat, gross: round2(a + vat) };
}

/** "a@b.co, c@d.co; e@f.co" → geçerli, tekil, küçük harf e-postalar + geçersiz parçalar. */
export function parseEmailList(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of input.split(/[,;\s]+/)) {
    if (!part) continue;
    const e = normalizeEmail(part);
    if (e) {
      if (!valid.includes(e)) valid.push(e);
    } else invalid.push(part);
  }
  return { valid, invalid };
}

/** Yeniden deneme yalnız başarısız e-posta / sağlayıcı faturasına; elle kayıt hiç başarısız olmaz. */
export function canRetryInvoice(inv: Pick<Invoice, "status" | "mode">): boolean {
  return inv.status === "FAILED" && inv.mode !== "MANUAL";
}

/** Aynı satış için açık (başarısız/iptal olmayan) fatura varsa yeni fatura kesilirken uyarılır. */
export function hasActiveInvoice(invoices: ReadonlyArray<Pick<Invoice, "status">>): boolean {
  return invoices.some((i) => i.status !== "FAILED" && i.status !== "CANCELLED");
}

// --- Satış referansı ---------------------------------------------------------------------------

export type SaleRefKind = "payment" | "license";
export interface SaleRef {
  kind: SaleRefKind;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "payment:<uuid>" / "license:<uuid>" → SaleRef; başka biçim null. */
export function parseSaleRef(value: string | null | undefined): SaleRef | null {
  const m = /^(payment|license):(.+)$/.exec(value ?? "");
  if (!m || !UUID.test(m[2])) return null;
  return { kind: m[1] as SaleRefKind, id: m[2].toLowerCase() };
}

export function saleRefOf(ref: SaleRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** Ödeme varsa ödeme, yoksa lisans (fatura ekranındaki "aynı satış" anahtarı). */
export function primarySaleRef(sale: { paymentId?: string | null; licenseId?: string | null }): SaleRef | null {
  if (sale.paymentId) return { kind: "payment", id: sale.paymentId };
  if (sale.licenseId) return { kind: "license", id: sale.licenseId };
  return null;
}

/**
 * Aynı satış + aynı tutar/yöntem/tarih için tekrar tıklamada AYNI anahtar (sunucu çift faturayı engeller). `existingCount`
 * anahtara girer: kullanıcı mükerrer uyarısını bilerek geçip ikinci fatura keserse anahtar değişir, ilk faturaya
 * "tekrar oynatma" olmaz.
 */
export function invoiceIdempotencyKey(input: {
  saleRef: string;
  mode: InvoiceMode;
  amount: number;
  issueDate: string;
  existingCount: number;
}): string {
  return ["inv", input.saleRef, input.mode, input.amount.toFixed(2), input.issueDate, `n${input.existingCount}`].join(":");
}

// --- Durum -------------------------------------------------------------------------------------

export interface MailOutcome {
  ok: boolean;
  /** Kısa hata kodu (alıcı adresi / sağlayıcı mesajı içermez). */
  error?: string;
}

/**
 * E-posta gönderim sonucundan fatura durumu: gönderildiyse SENT (hata temizlenir), değilse FAILED + hata kodu.
 * Her deneme sayacı bir artırır (ilk deneme 1).
 */
export function outcomeAfterMail(
  attemptsBefore: number,
  result: MailOutcome
): { status: InvoiceStatus; error: string | null; attempts: number } {
  return {
    status: result.ok ? "SENT" : "FAILED",
    error: result.ok ? null : (result.error ?? "mail:failed").slice(0, 200),
    attempts: attemptsBefore + 1,
  };
}

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, "primary" | "success" | "destructive" | "muted"> = {
  PENDING: "primary",
  ISSUED: "success",
  SENT: "success",
  FAILED: "destructive",
  CANCELLED: "muted",
};

// --- Fatura talebi e-postası -------------------------------------------------------------------

const fmtTry = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2 }).format(n);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface InvoiceRequestEmailInput {
  customerName: string;
  billing: {
    type: "INDIVIDUAL" | "COMPANY";
    legalName: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    address: string | null;
    district: string | null;
    city: string | null;
    email: string | null;
  };
  description: string;
  net: number;
  vatRate: number;
  vat: number;
  gross: number;
  issueDate: string;
  note?: string | null;
}

/**
 * Muhasebeciye giden fatura talebi (DeepSport buildInvoiceEmailDraft'ın sunucu karşılığı). Düz metin + HTML;
 * her değer HTML'de kaçırılır (unvan, adres, not kullanıcı girdisidir).
 */
export function buildInvoiceRequestEmail(input: InvoiceRequestEmailInput): { subject: string; text: string; html: string } {
  const b = input.billing;
  // Konu tek satırdır (unvan kullanıcı girdisi: satır sonu başlık enjeksiyonu olmasın).
  const who = (b.legalName || input.customerName).replace(/\s+/g, " ").trim();
  const rows: [string, string][] = [["Müşteri", input.customerName]];
  if (b.legalName && b.legalName !== input.customerName) rows.push(["Unvan / Ad Soyad", b.legalName]);
  rows.push([b.type === "COMPANY" ? "VKN" : "TCKN", b.taxNumber || "—"]);
  if (b.type === "COMPANY") rows.push(["Vergi dairesi", b.taxOffice || "—"]);
  rows.push(
    ["Adres", [b.address, b.district, b.city].filter(Boolean).join(", ") || "—"],
    ["Fatura e-postası", b.email || "—"],
    ["Açıklama", input.description],
    ["Fatura tarihi", input.issueDate],
    ["Tutar (KDV hariç)", fmtTry(input.net)],
    [`KDV (%${input.vatRate})`, fmtTry(input.vat)],
    ["Toplam", fmtTry(input.gross)]
  );
  if (input.note) rows.push(["Not", input.note]);

  const text = ["Merhaba,", "", "Aşağıdaki satış için fatura kesilmesini rica ederiz.", "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Teşekkürler."].join("\n");
  const html =
    `<p>Merhaba,</p><p>Aşağıdaki satış için fatura kesilmesini rica ederiz.</p>` +
    `<table cellpadding="4" style="border-collapse:collapse">${rows
      .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table><p>Teşekkürler.</p>`;
  return { subject: `Fatura talebi — ${who} — ${input.issueDate}`, text, html };
}
