/**
 * Anket linki ve mesajları (DeepSport features/surveys/logic.ts → buildSurveyLink / buildSurveyMessage /
 * buildSurveyReminder, Edoras diliyle ve yalnız Türkçe) + e-posta gövdesi (Resend ile giden davet). Saf fonksiyonlar.
 */
import { normalizeTrPhone, toWhatsAppLink } from "@/lib/utils/phone";

/** Anket linki: {origin}/s/{token}. Panelde dil öneki yok (yalnız Türkçe). */
export function buildSurveyLink(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/s/${encodeURIComponent(token)}`;
}

/** İlk ad: "Ahmet Yılmaz" → "Ahmet"; boşsa null. Herkese açık sayfa yalnız bunu gösterir. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export type SurveyMessageKind = "invite" | "reminder";

export interface SurveyMessageInput {
  name?: string | null;
  link: string;
  /** "reminder": anket araması / hatırlatma metni. */
  kind?: SurveyMessageKind;
}

/** WhatsApp / SMS için hazır metin (kanal fark etmez; SMS'te de aynı metin kopyalanır). */
export function buildSurveyMessage({ name, link, kind = "invite" }: SurveyMessageInput): string {
  const first = firstNameOf(name);
  const hi = first ? `Merhaba ${first},` : "Merhaba,";
  return kind === "reminder"
    ? `${hi} 1 dakikalık Edoras memnuniyet anketimizi hatırlatmak istedik — kurumunuzun görüşü bizim için çok değerli: ${link}`
    : `${hi} kurumunuzun Edoras deneyimini merak ediyoruz. 1 dakikanızı ayırıp kısa anketimizi doldurabilir misiniz? ${link}`;
}

export interface SurveyReminder {
  link: string;
  message: string;
  /** wa.me linki; telefon geçersizse null. */
  whatsappUrl: string | null;
  /** sms: linki (iOS / Android gövde parametresi); telefon geçersizse null. */
  smsUrl: string | null;
}

/**
 * "Anket araması" / tekrar gönder: link + mesaj + WhatsApp / SMS bağlantıları tek yerden.
 * `buildSurveyReminder({ origin: appOrigin(), token, name, phone })`.
 */
export function buildSurveyReminder(input: {
  origin: string;
  token: string;
  name?: string | null;
  phone?: string | null;
  kind?: SurveyMessageKind;
}): SurveyReminder {
  const link = buildSurveyLink(input.origin, input.token);
  const message = buildSurveyMessage({ name: input.name, link, kind: input.kind ?? "reminder" });
  const e164 = normalizeTrPhone(input.phone);
  return {
    link,
    message,
    whatsappUrl: toWhatsAppLink(input.phone, message),
    smsUrl: e164 ? `sms:${e164}?&body=${encodeURIComponent(message)}` : null,
  };
}

// ---------------------------------------------------------------------------
// E-posta (Resend) — HTML'e giren her değer kaçışlanır.
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SurveyEmail {
  subject: string;
  html: string;
  text: string;
}

/** Davet / hatırlatma e-postası: selam (ilk ad), giriş metni, tek düğme ve düz metin yedeği. */
export function buildSurveyEmail(input: {
  name?: string | null;
  link: string;
  title: string;
  intro?: string | null;
  kind?: SurveyMessageKind;
}): SurveyEmail {
  const first = firstNameOf(input.name);
  const hi = first ? `Merhaba ${first},` : "Merhaba,";
  const reminder = input.kind === "reminder";
  const intro =
    input.intro?.trim() || "Kurumunuzun Edoras deneyimini merak ediyoruz. Anket yaklaşık 1 dakika sürer.";
  const lead = reminder ? "Kısa memnuniyet anketimizi hatırlatmak istedik." : intro;
  const subject = reminder ? `Hatırlatma: ${input.title}` : input.title;
  const cta = "Anketi aç";
  const footer = "Yanıtınız yalnızca hizmetimizi iyileştirmek için kullanılır. Link size özeldir; lütfen paylaşmayın.";

  const text = [hi, "", lead, "", `${cta}: ${input.link}`, "", footer, "", "Edoras"].join("\n");
  const html = `<!doctype html>
<html lang="tr"><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;font-weight:bold;letter-spacing:.04em;color:#4f46e5">EDORAS</td></tr>
<tr><td style="padding-top:16px;font-size:18px;font-weight:bold">${escapeHtml(input.title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.5">${escapeHtml(hi)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5">${escapeHtml(lead)}</td></tr>
<tr><td style="padding-top:20px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${cta}</a></td></tr>
<tr><td style="padding-top:16px;font-size:12px;color:#6b7280;line-height:1.5">${escapeHtml(footer)}<br>${escapeHtml(input.link)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
