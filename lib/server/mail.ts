import "server-only";

/**
 * E-posta gönderimi — Resend REST API'si doğrudan `fetch` ile (SDK yok; Edoras'taki lib/transactional-email.ts ile aynı
 * yol: POST https://api.resend.com/emails). Ortam değişkenleri İSTEĞE BAĞLI:
 *   RESEND_API_KEY  Resend anahtarı (yalnız sunucu)
 *   EMAIL_FROM      gönderen, ör. "Edoras <anket@edorasapp.ai>" (Resend'de doğrulanmış alan adı)
 * İkisi birden tanımlı değilse e-posta kapalıdır: anket ekranı EMAIL kanalını kapatır, uç 503 MAIL_NOT_CONFIGURED
 * döner. Edoras'taki `onboarding@resend.dev` yedeği bilinçli olarak YOK — o adres yalnız Resend hesabının sahibine
 * gönderir; müşteriye gitmeyen bir "gönderildi" üretmesin.
 *
 * Hata hâlinde sağlayıcının mesajı (alıcı adresini içerebilir) istemciye ve loga yazılmaz; yalnız kısa kod döner
 * (ör. "resend:422", "resend:timeout").
 */

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 15_000;

function mailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** E-posta gönderimi açık mı (anket ekranı EMAIL kanalını buna göre açar). */
export function isMailConfigured(): boolean {
  return mailConfig() != null;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Resend `Idempotency-Key` (24 saat): aynı anahtarla ikinci istek ikinci e-posta göndermez (çift tıklama, ağ tekrarı).
   */
  idempotencyKey?: string;
}

export type MailResult = { ok: true } | { ok: false; error: string };

export async function sendMail(input: MailInput): Promise<MailResult> {
  const config = mailConfig();
  if (!config) return { ok: false, error: "mail:not-configured" };
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: config.from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      // Gövde okunmaz / loglanmaz: sağlayıcı mesajı alıcı adresini taşıyabilir.
      await res.body?.cancel().catch(() => undefined);
      return { ok: false, error: `resend:${res.status}` };
    }
    await res.body?.cancel().catch(() => undefined);
    return { ok: true };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, error: timeout ? "resend:timeout" : "resend:network" };
  }
}
