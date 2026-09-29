/**
 * Telefon ve e-posta normalizasyonu. contactPhone / User.phone serbest metin olduğu için
 * tıkla-ara, WhatsApp ve mükerrer eşleşmesi hep buradan geçer.
 * Kütüphanesiz, TR odaklı: TR numaraları +90XXXXXXXXXX'e çevrilir; "+" ile yazılmış
 * yabancı numaralar yalnızca rakamları temizlenerek kabul edilir.
 */

/** TR ulusal numara: 10 hane; 5xx cep, 2xx/3xx/4xx sabit, 8xx servis. */
const TR_NATIONAL = /^[2-58]\d{9}$/;

/** E.164 (+905XXXXXXXXX) döner; çevrilemiyorsa null. */
export function normalizeTrPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  const international = trimmed.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (international) {
    if (digits.startsWith("90")) {
      // "+90 0532…" gibi fazladan yazılmış trunk 0'ı tolere et.
      const national = digits.slice(2).replace(/^0(?=\d{10}$)/, "");
      return TR_NATIONAL.test(national) ? `+90${national}` : null;
    }
    // Yabancı numara: E.164 uzunluk sınırı (8–15 hane), ülke kodu 0 ile başlamaz.
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }

  let national = digits;
  if (national.length === 12 && national.startsWith("90")) national = national.slice(2);
  else if (national.length === 11 && national.startsWith("0")) national = national.slice(1);

  return TR_NATIONAL.test(national) ? `+90${national}` : null;
}

/** wa.me bağlantısı (isteğe bağlı hazır mesajla); telefon geçersizse null. */
export function toWhatsAppLink(phone: string | null | undefined, text?: string): string | null {
  const e164 = normalizeTrPhone(phone);
  if (!e164) return null;
  const base = `https://wa.me/${e164.slice(1)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** tel: bağlantısı; telefon geçersizse null. */
export function toTelLink(phone: string | null | undefined): string | null {
  const e164 = normalizeTrPhone(phone);
  return e164 ? `tel:${e164}` : null;
}

/** Küçük harf + trim; "@" içermiyorsa null. */
export function normalizeEmail(input: string | null | undefined): string | null {
  const email = input?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  return email;
}
