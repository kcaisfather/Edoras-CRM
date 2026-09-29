/**
 * Form + API doğrulaması (tek kaynak): istemci formları ve sunucu uçları aynı şemaları kullanır.
 * Panel yalnız Türkçe olduğu için mesajlar burada Türkçe yazılır. Değerler form gibi string gelir;
 * sunucu `to*` fonksiyonlarıyla veritabanı biçimine çevirir (telefon E.164, e-posta küçük harf…).
 */
import { z } from "zod";
import { normalizeTrPhone } from "@/lib/utils/phone";
import { parseAmount } from "@/lib/utils/money";
import {
  ADDRESS_MIN_LENGTH,
  digitsOnly,
  isFullName,
  isIsoDate,
  isValidTckn,
  isValidVkn,
} from "./rules";
import { PAYMENT_METHODS, type Billing, type PaymentMethod } from "./types";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const MSG = {
  institutionName: "Kurum adı zorunlu",
  contactNameRequired: "Yetkilinin adı soyadı zorunlu",
  contactNameFull: "Ad ve soyadı birlikte yazın",
  phoneRequired: "Telefon zorunlu",
  phoneInvalid: "Geçerli bir telefon girin (05XX XXX XX XX)",
  emailRequired: "E-posta zorunlu",
  emailInvalid: "Geçerli bir e-posta adresi girin",
  address: `Açık adres zorunlu (en az ${ADDRESS_MIN_LENGTH} karakter)`,
  tcInvalid: "Geçerli bir TC Kimlik No girin (11 hane)",
  vknInvalid: "Geçerli bir Vergi No girin (10 hane)",
  date: "Geçerli bir tarih seçin",
  priceInvalid: "Geçerli bir tutar girin (ör. 45.000)",
  amountInvalid: "Sıfırdan büyük bir tutar girin",
  method: "Ödeme yöntemini seçin",
} as const;

// --- Alanlar ----------------------------------------------------------------------------------

const contactShape = {
  contactName: z.string().trim().min(1, MSG.contactNameRequired).refine(isFullName, MSG.contactNameFull),
  contactPhone: z
    .string()
    .trim()
    .min(1, MSG.phoneRequired)
    .refine((v) => normalizeTrPhone(v) !== null, MSG.phoneInvalid),
  contactEmail: z.string().trim().min(1, MSG.emailRequired).refine((v) => EMAIL.test(v), MSG.emailInvalid),
};

const billingShape = {
  address: z.string().trim(),
  idType: z.enum(["TC", "VKN"]),
  idNumber: z.string().trim(),
};

const licenseShape = {
  licenseStartsOn: z.string(),
  licensePrice: z.string(),
};

const paymentShape = {
  payAmount: z.string(),
  payMethod: z.string(),
  paidOn: z.string(),
};

type Ctx = z.RefinementCtx;

function checkBilling(v: { address: string; idType: "TC" | "VKN"; idNumber: string }, ctx: Ctx) {
  if (v.address.length < ADDRESS_MIN_LENGTH) ctx.addIssue({ code: "custom", path: ["address"], message: MSG.address });
  const digits = digitsOnly(v.idNumber);
  if (v.idType === "TC" && !isValidTckn(digits)) ctx.addIssue({ code: "custom", path: ["idNumber"], message: MSG.tcInvalid });
  if (v.idType === "VKN" && !isValidVkn(digits)) ctx.addIssue({ code: "custom", path: ["idNumber"], message: MSG.vknInvalid });
}

function checkLicense(v: { licenseStartsOn: string; licensePrice: string }, ctx: Ctx) {
  if (!isIsoDate(v.licenseStartsOn)) ctx.addIssue({ code: "custom", path: ["licenseStartsOn"], message: MSG.date });
  if (parseAmount(v.licensePrice) === null) ctx.addIssue({ code: "custom", path: ["licensePrice"], message: MSG.priceInvalid });
}

function checkPayment(v: { payAmount: string; payMethod: string; paidOn: string }, ctx: Ctx) {
  const amount = parseAmount(v.payAmount);
  if (amount === null || amount <= 0) ctx.addIssue({ code: "custom", path: ["payAmount"], message: MSG.amountInvalid });
  if (!(PAYMENT_METHODS as readonly string[]).includes(v.payMethod)) {
    ctx.addIssue({ code: "custom", path: ["payMethod"], message: MSG.method });
  }
  if (!isIsoDate(v.paidOn)) ctx.addIssue({ code: "custom", path: ["paidOn"], message: MSG.date });
}

// --- Şemalar ----------------------------------------------------------------------------------

/** Yeni demo kurum: kurum adı + yetkili ad soyad + telefon + e-posta (kural). */
export const newDemoSchema = z.object({
  institutionName: z.string().trim().min(2, MSG.institutionName).max(120),
  program: z.enum(["yks", "lgs"]),
  ...contactShape,
});
export type NewDemoInput = z.input<typeof newDemoSchema>;

export const contactSchema = z.object(contactShape);
export type ContactInput = z.input<typeof contactSchema>;

/** Fatura bilgisi: adres + (TC veya Vergi No). Ücretli hesap ve ödeme bunu şart koşar. */
export const billingSchema = z.object(billingShape).superRefine(checkBilling);
export type BillingInput = z.input<typeof billingSchema>;

/** Demo → ücretli: fatura + ilk lisans (1 yıl) + isteğe bağlı ilk ödeme. */
export const convertSchema = z
  .object({ ...billingShape, ...licenseShape, ...paymentShape, withPayment: z.boolean() })
  .superRefine((v, ctx) => {
    checkBilling(v, ctx);
    checkLicense(v, ctx);
    if (v.withPayment) checkPayment(v, ctx);
  });
export type ConvertInput = z.input<typeof convertSchema>;

/**
 * CRM öncesinden kalan kurumu kayda alma: DEMO (demonun gerçek başlangıcı; bitiş +1 yıl) ya da
 * UCRETLI (fatura + süren lisansın başlangıcı ve bedeli).
 */
export const enrollSchema = z
  .object({
    status: z.enum(["DEMO", "UCRETLI"]),
    ...contactShape,
    demoStartsOn: z.string(),
    ...billingShape,
    ...licenseShape,
  })
  .superRefine((v, ctx) => {
    if (v.status === "DEMO" && !isIsoDate(v.demoStartsOn)) {
      ctx.addIssue({ code: "custom", path: ["demoStartsOn"], message: MSG.date });
    }
    if (v.status === "UCRETLI") {
      checkBilling(v, ctx);
      checkLicense(v, ctx);
    }
  });
export type EnrollInput = z.input<typeof enrollSchema>;

export const paymentSchema = z
  .object({ ...paymentShape, licenseId: z.union([z.literal(""), z.uuid()]), note: z.string().trim().max(500) })
  .superRefine(checkPayment);
export type PaymentInput = z.input<typeof paymentSchema>;

export const renewSchema = z
  .object({ licensePrice: z.string() })
  .refine((v) => parseAmount(v.licensePrice) !== null, { path: ["licensePrice"], message: MSG.priceInvalid });
export type RenewInput = z.input<typeof renewSchema>;

// --- Veritabanı biçimine çeviriler (şemadan geçmiş değerlerle çağrılır) --------------------

export function toContact(v: ContactInput) {
  return {
    contactName: v.contactName.trim().replace(/\s+/g, " "),
    contactPhone: normalizeTrPhone(v.contactPhone) as string,
    contactEmail: v.contactEmail.trim().toLowerCase(),
  };
}

export function toBilling(v: BillingInput): Billing {
  const digits = digitsOnly(v.idNumber);
  return {
    address: v.address.trim(),
    tcNo: v.idType === "TC" ? digits : null,
    taxNo: v.idType === "VKN" ? digits : null,
  };
}

export function toLicense(v: { licenseStartsOn: string; licensePrice: string }) {
  return { startsOn: v.licenseStartsOn, price: parseAmount(v.licensePrice) as number };
}

export function toPayment(v: { payAmount: string; payMethod: string; paidOn: string }) {
  return { amount: parseAmount(v.payAmount) as number, method: v.payMethod as PaymentMethod, paidOn: v.paidOn };
}

/** Kayıtlı fatura bilgisinden form başlangıç değerleri. */
export function billingFormValues(billing: Billing | null): BillingInput {
  if (billing?.taxNo) return { address: billing.address ?? "", idType: "VKN", idNumber: billing.taxNo };
  return { address: billing?.address ?? "", idType: "TC", idNumber: billing?.tcNo ?? "" };
}

