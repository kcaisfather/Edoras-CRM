import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Zamanlayıcı ucu kapısı (POST /api/cron/reports). Oturum yok; tek yetki `Authorization: Bearer ${CRON_SECRET}`.
 * Vercel Cron aynı başlığı (CRON_SECRET tanımlıysa) kendisi ekler.
 *
 * - CRON_SECRET tanımsız / boş → uç KAPALI (503); "secret yok = herkese açık" hâli olmaz.
 * - Karşılaştırma sabit zamanlıdır: iki taraf SHA-256 ile eşit uzunluğa getirilir, timingSafeEqual ile kıyaslanır
 *   (uzunluk bilgisi de sızmaz).
 * - Secret hiçbir yerde loglanmaz / döndürülmez.
 *
 * Saf modül (`server-only` yok): testlenir; yalnız sunucu uçları kullanır.
 */

export type CronAuthResult = "ok" | "not-configured" | "unauthorized";

const digest = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();

export function checkCronAuth(authorization: string | null | undefined, secret: string | null | undefined): CronAuthResult {
  const expected = (secret ?? "").trim();
  if (!expected) return "not-configured";
  const match = /^Bearer\s+(.+)$/i.exec((authorization ?? "").trim());
  if (!match) return "unauthorized";
  return timingSafeEqual(digest(match[1].trim()), digest(expected)) ? "ok" : "unauthorized";
}
