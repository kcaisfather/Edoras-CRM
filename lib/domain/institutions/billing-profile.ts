/**
 * Fatura profili tamlığı — saf fonksiyon (DeepSport features/invoices/logic.ts → billingCompleteness'ten).
 * Fatura talebi (e-posta) muhasebeciye gidecek bilgilerin hepsini ister: unvan, kimlik no, (kurumsalda) vergi dairesi,
 * adres, il, ilçe, fatura e-postası. Adres + TC/VKN'yi (ücretli hesap ve ödeme kuralı) veritabanı zaten zorunlu kılar;
 * bu, onun üstüne gelen fatura kuralıdır (SQL'de billing_type doluyken crm_institutions_billing_profile_check).
 */
import { normalizeEmail } from "@/lib/utils/phone";
import { ADDRESS_MIN_LENGTH, isValidTckn, isValidVkn } from "./rules";
import type { BillingProfile, BillingType } from "./types";

export type BillingField = "legalName" | "taxNumber" | "taxOffice" | "address" | "city" | "district" | "email";

export interface BillingCompleteness {
  complete: boolean;
  missing: BillingField[];
  invalid: BillingField[];
}

type ProfileLike = Partial<
  Pick<BillingProfile, "billingType" | "address" | "tcNo" | "taxNo" | "legalName" | "taxOffice" | "city" | "district" | "email">
>;

/** Kayıtlı tür; eski kayıtta (null) kimlikten: Vergi No varsa kurumsal, yoksa bireysel. */
export function effectiveBillingType(p: Pick<BillingProfile, "billingType" | "taxNo"> | null | undefined): BillingType {
  if (p?.billingType) return p.billingType;
  return p?.taxNo ? "COMPANY" : "INDIVIDUAL";
}

const filled = (v: string | null | undefined) => (v ?? "").trim().length > 0;

/**
 * Fatura kesmek için gereken alanlar. Kurumsal: unvan, VKN, vergi dairesi, adres, il, ilçe, e-posta.
 * Bireysel: ad soyad, TCKN, adres, il, ilçe, e-posta (vergi dairesi gerekmez).
 */
export function billingProfileCompleteness(p: ProfileLike | null | undefined): BillingCompleteness {
  if (!p) {
    return { complete: false, missing: ["legalName", "taxNumber", "address", "city", "district", "email"], invalid: [] };
  }
  const company = effectiveBillingType({ billingType: p.billingType ?? null, taxNo: p.taxNo ?? null }) === "COMPANY";
  const taxNumber = company ? p.taxNo : p.tcNo;
  const values: Record<BillingField, string | null | undefined> = {
    legalName: p.legalName,
    taxNumber,
    taxOffice: p.taxOffice,
    address: p.address,
    city: p.city,
    district: p.district,
    email: p.email,
  };
  const need: BillingField[] = company
    ? ["legalName", "taxNumber", "taxOffice", "address", "city", "district", "email"]
    : ["legalName", "taxNumber", "address", "city", "district", "email"];
  const missing = need.filter((f) => !filled(values[f]));
  const invalid: BillingField[] = [];
  if (filled(taxNumber) && !(company ? isValidVkn(taxNumber) : isValidTckn(taxNumber))) invalid.push("taxNumber");
  if (filled(p.address) && (p.address ?? "").trim().length < ADDRESS_MIN_LENGTH) invalid.push("address");
  if (filled(p.email) && !normalizeEmail(p.email)) invalid.push("email");
  return { complete: missing.length === 0 && invalid.length === 0, missing, invalid };
}
