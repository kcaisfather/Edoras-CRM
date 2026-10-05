/**
 * Form + API doğrulaması (tek kaynak): istemci formları ve sunucu uçları aynı şemaları kullanır.
 * Panel yalnız Türkçe olduğu için mesajlar burada Türkçe yazılır. Değerler form gibi string gelir;
 * sunucu `to*` fonksiyonlarıyla veritabanı biçimine çevirir (telefon E.164, e-posta küçük harf…).
 */
import { z } from "zod";
import { canonicalLocation, withLocationDefaults } from "@/lib/data/tr-locations";
import { normalizeTrPhone } from "@/lib/utils/phone";
import { parseAmount } from "@/lib/utils/money";
import {
  ADDRESS_MIN_LENGTH,
  digitsOnly,
  isFullName,
  isIsoDate,
  isValidTckn,
  isValidTaxNumber,
} from "./rules";
import { effectiveBillingType } from "./billing-profile";
import { PAYMENT_METHODS, type Billing, type BillingProfile, type BillingType, type PaymentMethod } from "./types";

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
  vknInvalid: "Geçerli bir Vergi No (10 hane) ya da şahıs şirketi için TC Kimlik No (11 hane) girin",
  legalName: "Unvan / ad soyad zorunlu (en az 2 karakter)",
  taxOffice: "Kurumsal (Vergi No) fatura için vergi dairesi zorunlu",
  city: "İl zorunlu",
  district: "İlçe zorunlu",
  postalCode: "Posta kodu 5 haneli olmalı",
  billingEmail: "Faturanın gideceği geçerli bir e-posta girin",
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

/** Fatura profili alanları (adres + kimlik `billingShape`'te). Kurumsal = Vergi No, bireysel = TC Kimlik No. */
const profileShape = {
  legalName: z.string().trim().max(200),
  taxOffice: z.string().trim().max(100),
  city: z.string().trim().max(100),
  district: z.string().trim().max(100),
  postalCode: z.string().trim(),
  email: z.string().trim(),
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
  if (v.idType === "VKN" && !isValidTaxNumber(digits)) ctx.addIssue({ code: "custom", path: ["idNumber"], message: MSG.vknInvalid });
}

function checkProfile(
  v: { idType: "TC" | "VKN"; legalName: string; taxOffice: string; city: string; district: string; postalCode: string; email: string },
  ctx: Ctx
) {
  if (v.legalName.length < 2) ctx.addIssue({ code: "custom", path: ["legalName"], message: MSG.legalName });
  if (v.idType === "VKN" && v.taxOffice.length < 2) ctx.addIssue({ code: "custom", path: ["taxOffice"], message: MSG.taxOffice });
  if (v.city.length < 2) ctx.addIssue({ code: "custom", path: ["city"], message: MSG.city });
  if (v.district.length < 2) ctx.addIssue({ code: "custom", path: ["district"], message: MSG.district });
  if (v.postalCode !== "" && !/^[0-9]{5}$/.test(v.postalCode)) ctx.addIssue({ code: "custom", path: ["postalCode"], message: MSG.postalCode });
  if (!EMAIL.test(v.email)) ctx.addIssue({ code: "custom", path: ["email"], message: MSG.billingEmail });
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

/**
 * Fatura profili (kurum ayrıntısı → "Fatura bilgileri", PUT /api/institutions/{id}/billing): adres + (TC veya Vergi No)
 * — ücretli hesap ve ödeme bunu şart koşar — ile birlikte unvan, il, ilçe ve fatura e-postası; Vergi No'da vergi dairesi.
 * TC ⇔ bireysel, Vergi No ⇔ kurumsal (SQL: crm_institutions_billing_profile_check).
 */
export const billingSchema = z
  .object({ ...billingShape, ...profileShape })
  .superRefine((v, ctx) => {
    checkBilling(v, ctx);
    checkProfile(v, ctx);
  });
export type BillingInput = z.input<typeof billingSchema>;

/** Yalnız adres + kimlik (ücretliye geçiş ve kayda alma formlarının fatura kısmı; profil sonradan tamamlanır). */
export const billingCoreSchema = z.object(billingShape).superRefine(checkBilling);
export type BillingCoreInput = z.input<typeof billingCoreSchema>;

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

export function toBilling(v: BillingCoreInput): Billing {
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

/** Fatura profili yazımı (crm_institutions sütunlarına): tür kimlikten türetilir, vergi dairesi yalnız Vergi No ile. */
export interface BillingProfileWrite extends Billing {
  billingType: BillingType;
  legalName: string;
  taxOffice: string | null;
  city: string;
  district: string;
  postalCode: string | null;
  email: string;
}

export function toBillingProfile(v: BillingInput): BillingProfileWrite {
  const core = toBilling(v);
  const company = v.idType === "VKN";
  return {
    ...core,
    billingType: company ? "COMPANY" : "INDIVIDUAL",
    legalName: v.legalName.trim().replace(/\s+/g, " "),
    taxOffice: company ? v.taxOffice.trim().replace(/\s+/g, " ") : null,
    city: v.city.trim().replace(/\s+/g, " "),
    district: v.district.trim().replace(/\s+/g, " "),
    postalCode: v.postalCode.trim() || null,
    email: v.email.trim().toLowerCase(),
  };
}

/** Kayıtlı fatura bilgisinden adres + kimlik form başlangıç değerleri (ücretliye geçiş / kayda alma formları). */
export function billingFormValues(billing: Billing | null): BillingCoreInput {
  if (billing?.taxNo) return { address: billing.address ?? "", idType: "VKN", idNumber: billing.taxNo };
  return { address: billing?.address ?? "", idType: "TC", idNumber: billing?.tcNo ?? "" };
}

/**
 * Fatura profili formunun başlangıç değerleri. Kayıt yoksa `defaults` (ör. unvan = kurum adı, e-posta = yetkili
 * e-postası) kullanılır; eski kayıtta (tür null) tür kimlikten çıkarılır.
 */
export function billingProfileFormValues(
  billing: BillingProfile | null,
  defaults: { legalName?: string; email?: string } = {}
): BillingInput {
  const idType = billing ? (effectiveBillingType(billing) === "COMPANY" ? "VKN" : "TC") : "TC";
  const loc = withLocationDefaults(canonicalLocation({ city: billing?.city, district: billing?.district, country: "" }));
  return {
    address: billing?.address ?? "",
    idType,
    idNumber: (idType === "VKN" ? billing?.taxNo : billing?.tcNo) ?? "",
    legalName: billing?.legalName ?? defaults.legalName ?? "",
    taxOffice: billing?.taxOffice ?? "",
    // Kayıt yoksa İstanbul varsayılanı; eski serbest yazımlar resmî yazıma eşlenir.
    city: loc.city,
    district: loc.district,
    postalCode: billing?.postalCode ?? "",
    email: billing?.email ?? defaults.email ?? "",
  };
}

