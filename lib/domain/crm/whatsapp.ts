/**
 * WhatsApp kullanıcı adı (telefondan bağımsız WhatsApp kimliği). Kural WhatsApp'ınkiyle ve veritabanıyla aynı
 * (crm_leads_whatsapp_username_check): 3–35 karakter, yalnız a-z 0-9 . _ ve en az bir harf. Saklanırken "@" atılır,
 * küçük harfe çevrilir. Saf fonksiyonlar — testler whatsapp.test.ts'te.
 */

const USERNAME = /^[a-z0-9._]{3,35}$/;

/** "@Ayse.Yilmaz " → "ayse.yilmaz" (boş → ""). */
export function normalizeWhatsAppUsername(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

/** Normalleştirilmiş ad kurala uyuyor mu (boş değer kabul edilmez; boşluk kontrolü çağırandadır). */
export function isWhatsAppUsername(value: string): boolean {
  const v = normalizeWhatsAppUsername(value);
  return USERNAME.test(v) && /[a-z]/.test(v);
}

export const WHATSAPP_USERNAME_MESSAGE = "Geçerli bir WhatsApp kullanıcı adı girin (3–35 karakter: a-z, 0-9, . _)";
