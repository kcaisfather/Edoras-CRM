/**
 * Edoras kurum yöneticisi hesapları (Kurum ayrıntısı → Kurum yöneticileri): giriş e-postası, şifre sıfırlama, aktif /
 * pasif. Saf kurallar + istek şemaları; Edoras erişimi `lib/server/edoras.ts`'te, işlem kaydı
 * `lib/server/institution-admin-accounts.ts`'te. Testler: edoras-accounts.test.ts.
 *
 * Giriş kimliği (edoras-admin `lib/login-identifier.ts`): Supabase Auth e-posta istediği için telefon / TC ile giriş
 * sahte bir adrese eşlenir — telefon `<10 hane>@edoras.com`, TC `<11 hane>@internal.local` (veli / öğrenci yer
 * tutucuları da `@internal.local`). Bu adresler girişte HESAPLANIR: değiştirilirse telefon / TC girişi kırılır; yeni
 * adres bu alan adlarından birinde olursa başka birinin telefon / TC kimliğini ele geçirebilir. İkisi de reddedilir.
 */
import { z } from "zod";

/** Telefonla giren hesapların auth alan adı (edoras-admin `PHONE_LOGIN_EMAIL_DOMAIN`). */
export const PHONE_LOGIN_EMAIL_DOMAIN = "edoras.com";
/** TC ile giren hesapların ve yer tutucu adreslerin alan adı (edoras-admin `IDENTITY_EMAIL_DOMAIN`). */
export const IDENTITY_EMAIL_DOMAIN = "internal.local";

/** Kurum yöneticisinin Edoras'a nasıl girdiği: e-posta, telefon (`@edoras.com`) ya da TC (`@internal.local`). */
export type EdorasLoginKind = "email" | "phone" | "tc";

/** Auth e-postası biçimi: boşluksuz, küçük harf (Edoras da böyle yazar ve karşılaştırır). */
export function normalizeLoginEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase().replace(/\.+$/, "");
}

/** Telefon / TC girişine ayrılmış alan adı mı (giriş e-postası olarak kullanılamaz). */
export function isReservedLoginDomain(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = domainOf(email);
  return domain === PHONE_LOGIN_EMAIL_DOMAIN || domain === IDENTITY_EMAIL_DOMAIN;
}

/** Auth e-postasından giriş türü. Adres yoksa e-posta sayılır (Edoras'ta her yönetici e-postalı açılır). */
export function edorasLoginKind(authEmail: string | null | undefined): EdorasLoginKind {
  const domain = authEmail ? domainOf(authEmail) : "";
  if (domain === PHONE_LOGIN_EMAIL_DOMAIN) return "phone";
  if (domain === IDENTITY_EMAIL_DOMAIN) return "tc";
  return "email";
}

/**
 * Girişte yazılan kimlik: telefon hesabında 0'lı 11 hane, TC hesabında 11 hane, aksi hâlde e-posta. Kalıba uymayan
 * yer tutucu adres (ör. `edoras+<uuid>@internal.local`) olduğu gibi döner.
 */
export function loginIdentifierFor(authEmail: string): string {
  const email = normalizeLoginEmail(authEmail);
  const local = email.slice(0, Math.max(0, email.lastIndexOf("@")));
  const kind = edorasLoginKind(email);
  if (kind === "phone" && /^\d{10}$/.test(local)) return `0${local}`;
  if (kind === "tc" && /^\d{11}$/.test(local)) return local;
  return email;
}

export type AdminEmailChangeBlock =
  /** Edoras süper yöneticisi — CRM'den hiçbir hesap işlemi yapılmaz. */
  | "superAdmin"
  /** Hesap telefon / TC ile giriyor; adres değişirse girişi kırılır. */
  | "loginNotEmail"
  /** Yeni adres telefon / TC alan adında. */
  | "reservedDomain"
  /** Adres zaten bu. */
  | "same";

/** Giriş e-postası değişikliğinin önündeki engel (yoksa null). Sunucu auth'taki GÜNCEL adresle çağırır. */
export function adminEmailChangeBlock(input: {
  currentEmail: string | null;
  nextEmail: string;
  isSuperAdmin: boolean;
}): AdminEmailChangeBlock | null {
  if (input.isSuperAdmin) return "superAdmin";
  if (edorasLoginKind(input.currentEmail) !== "email") return "loginNotEmail";
  const next = normalizeLoginEmail(input.nextEmail);
  if (isReservedLoginDomain(next)) return "reservedDomain";
  if (input.currentEmail && normalizeLoginEmail(input.currentEmail) === next) return "same";
  return null;
}

/** Bu kişi pasife alınınca kurumda başka aktif yönetici kalmıyor mu. */
export function leavesNoActiveAdmin(admins: readonly { userId: string; isActive: boolean }[], userId: string): boolean {
  return !admins.some((a) => a.userId !== userId && a.isActive);
}

// --- İstek şemaları ------------------------------------------------------------------------------

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const ADMIN_ACCOUNT_MESSAGES = {
  emailRequired: "E-posta zorunlu",
  emailInvalid: "Geçerli bir e-posta adresi girin",
  emailReserved: "@edoras.com ve @internal.local adresleri Edoras'ta telefon / TC girişine ayrılmış; giriş e-postası olamaz",
} as const;

/** PATCH /api/institutions/{id}/admins/{userId} — yeni giriş e-postası (sunucu küçük harfe çevirir). */
export const adminEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, ADMIN_ACCOUNT_MESSAGES.emailRequired)
    .refine((v) => EMAIL.test(v), ADMIN_ACCOUNT_MESSAGES.emailInvalid)
    .refine((v) => !isReservedLoginDomain(v), ADMIN_ACCOUNT_MESSAGES.emailReserved),
});
export type AdminEmailInput = z.input<typeof adminEmailSchema>;

/**
 * PATCH /api/institutions/{id}/admins/{userId}/active. Kurumdaki son aktif yönetici pasife alınacaksa
 * `confirmLastAdmin: true` şart (yoksa 409 EDORAS_LAST_ADMIN) — ekran bunu açık onayla gönderir.
 */
export const adminActiveSchema = z.object({
  active: z.boolean(),
  confirmLastAdmin: z.boolean().optional(),
});
export type AdminActiveInput = z.infer<typeof adminActiveSchema>;

/** POST /api/institutions/{id}/admins/{userId}/password — gövde boş. */
export const adminPasswordResetSchema = z.object({}).strict();

/** Şifre sıfırlamanın yanıtı: bir kez gösterilir, hiçbir yerde saklanmaz. */
export interface AdminPasswordReset {
  /** Girişte yazılacak kimlik (e-posta, 0'lı telefon ya da TC). */
  loginIdentifier: string;
  loginKind: EdorasLoginKind;
  temporaryPassword: string;
  panelUrl: string;
}

export interface AdminEmailChangeResult {
  /** false: adres zaten buydu (Auth'a yazılmadı). */
  changed: boolean;
}

export interface AdminActiveChangeResult {
  /** false: üyelik zaten istenen durumdaydı. */
  changed: boolean;
}
