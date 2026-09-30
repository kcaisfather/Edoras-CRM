/**
 * Fatura API doğrulaması (tek kaynak): sunucu uçları ve ekran aynı şemaları kullanır. Sayı alanları JSON sayısıdır
 * (ekran formdaki metni parseAmount ile sayıya çevirip yollar).
 */
import { z } from "zod";
import { isIsoDate } from "@/lib/domain/institutions/rules";
import { PAYMENT_METHODS } from "@/lib/domain/institutions/types";
import { parseSaleRef } from "./logic";
import { INVOICE_MODES, INVOICE_PROVIDER_CODES, INVOICE_STATUSES } from "./types";

const MSG = {
  sale: "Ödeme ya da lisans seçin",
  amount: "Sıfırdan büyük bir tutar girin",
  vatRate: "KDV oranı 0–100 arasında olmalı",
  description: "Açıklama en az 2 karakter olmalı",
  date: "Geçerli bir tarih seçin",
  invoiceNo: "Elle kayıtta fatura numarası zorunlu",
  provider: "Platform seçin",
} as const;

const isoDate = z.string().refine(isIsoDate, MSG.date);

export const createInvoiceSchema = z
  .object({
    institutionId: z.uuid(),
    paymentId: z.uuid().nullish(),
    licenseId: z.uuid().nullish(),
    mode: z.enum(INVOICE_MODES),
    /** PROVIDER'da zorunlu. */
    provider: z.enum(INVOICE_PROVIDER_CODES).nullish(),
    /** Girilen tutar; `vatIncluded` true ise KDV dahildir. */
    amount: z.number(MSG.amount).positive(MSG.amount).max(1_000_000_000, MSG.amount),
    vatRate: z.number().min(0, MSG.vatRate).max(100, MSG.vatRate),
    vatIncluded: z.boolean(),
    description: z.string().trim().min(2, MSG.description).max(500, MSG.description),
    /** YYYY-MM-DD (Europe/Istanbul). */
    issueDate: isoDate,
    /** EMAIL: müşterinin fatura e-postasına da gönder (muhasebeci adresi sunucu ayarıdır, istekte gelmez). */
    copyCustomer: z.boolean().optional(),
    /** MANUAL'de zorunlu: başka yerde kesilen faturanın numarası. */
    invoiceNo: z.string().trim().max(64).optional(),
    note: z.string().trim().max(500).optional(),
    /** Idempotency-Key başlığı yoksa gövdeden. */
    idempotencyKey: z.string().min(8).max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.paymentId && !v.licenseId) ctx.addIssue({ code: "custom", path: ["paymentId"], message: MSG.sale });
    if (v.mode === "MANUAL" && !v.invoiceNo) ctx.addIssue({ code: "custom", path: ["invoiceNo"], message: MSG.invoiceNo });
    if (v.mode === "PROVIDER" && !v.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: MSG.provider });
  });
export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoiceBody = z.output<typeof createInvoiceSchema>;

// --- Liste sorguları: geçersiz değer sessizce yok sayılır ---------------------------------------

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && isIsoDate(v) ? v : undefined));

const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : undefined));

const page = z
  .string()
  .optional()
  .transform((v) => Math.max(0, Number.parseInt(v ?? "0", 10) || 0));

const size = z
  .string()
  .optional()
  .transform((v) => Math.min(200, Math.max(1, Number.parseInt(v ?? "20", 10) || 20)));

export const invoiceListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => ((INVOICE_STATUSES as readonly string[]).includes(v ?? "") ? (v as (typeof INVOICE_STATUSES)[number]) : undefined)),
  institutionId: optionalUuid,
  from: optionalDate,
  to: optionalDate,
  saleRef: z
    .string()
    .optional()
    .transform((v) => parseSaleRef(v) ?? undefined),
  page,
  size,
});
export type InvoiceListQuery = z.output<typeof invoiceListQuerySchema>;

export const paymentListQuerySchema = z.object({
  from: optionalDate,
  to: optionalDate,
  method: z
    .string()
    .optional()
    .transform((v) => ((PAYMENT_METHODS as readonly string[]).includes(v ?? "") ? (v as (typeof PAYMENT_METHODS)[number]) : undefined)),
  institutionId: optionalUuid,
  query: z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, 100) || undefined),
  page,
  size,
});
export type PaymentListQuery = z.output<typeof paymentListQuerySchema>;
