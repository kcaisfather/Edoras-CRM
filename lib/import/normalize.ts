/**
 * İçe aktarmada telefon ve e-posta normalleştirmesi — TEK kaynak: tarayıcıdaki önizleme (mükerrer işaretleri) ve
 * sunucudaki doğrulama (lib/import/bulk.ts) aynı fonksiyonu kullanır; sunucu istemcinin hesapladığı değere
 * güvenmez, ham metinden yeniden hesaplar. Telefon adaylarla aynı TR normalleştiricisinden geçer (E.164).
 * E-posta kuralı veritabanıyla aynıdır (crm_prospects_email_check / crm_leads_contact_email_check: alan adında nokta).
 */
import { normalizeTrPhone } from "@/lib/utils/phone";

export const IMPORT_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_EMAIL_LENGTH = 254;

/** E.164 (+90…); çevrilemiyorsa null. */
export function normalizeImportPhone(input: string | null | undefined): string | null {
  return normalizeTrPhone(input);
}

/** Küçük harf + kırpma; biçim tutmuyorsa null. */
export function normalizeImportEmail(input: string | null | undefined): string | null {
  const email = input?.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !IMPORT_EMAIL.test(email)) return null;
  return email;
}

/** Kırpılmış, iç boşlukları tekilleşmiş metin ("" boş). */
export function cleanText(input: string | null | undefined): string {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
