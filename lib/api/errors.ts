import { ApiError } from "./client";
import type { ApiErrorCode } from "./error-codes";

/**
 * Sunucu hatasının kullanıcıya gösterilecek türü. Ham `err.message` asla ekrana basılmaz;
 * ApiError.status'a göre çevrilmiş bir mesaja eşlenir (bilinmeyen durum → genel mesaj).
 */
export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "validation"
  | "network"
  | "generic";

export function apiErrorKind(err: unknown): ApiErrorKind {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 0:
        return "network";
      case 401:
        return "unauthorized";
      case 403:
        return "forbidden";
      case 404:
        return "notFound";
      case 409:
        return "conflict";
      case 400:
      case 422:
        return "validation";
      default:
        return "generic";
    }
  }
  // fetch ağ hatası TypeError fırlatır (ApiError değil).
  if (err instanceof TypeError) return "network";
  return "generic";
}

/** Sunucunun iş kuralı kodu (ör. BILLING_REQUIRED); yoksa null. */
export function apiErrorCode(err: unknown): ApiErrorCode | null {
  return err instanceof ApiError ? err.code : null;
}

/**
 * Doğrulama hatasında sunucunun alan mesajları (`error.fields`, Türkçe zod mesajları): "mesaj; mesaj". Alan adları
 * teknik olduğu için gösterilmez. Alan yoksa null. (DeepSport 422 alan hatası gösteriminin karşılığı.)
 */
export function apiErrorFieldDetail(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.fields) return null;
  const parts = [...new Set(Object.values(err.fields).map((m) => (typeof m === "string" ? m.trim() : "")).filter(Boolean))];
  return parts.length ? parts.join("; ") : null;
}
