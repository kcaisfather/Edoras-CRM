/**
 * Basit oran sınırı — bellek içi kayan pencere (herkese açık anket uçları: /api/public/surveys/*).
 *
 * SINIR: sayaçlar bu Node sürecinin belleğindedir. Tek süreçte (`next start`, tek sunucu) doğru çalışır; birden çok
 * örnek / sunucusuz (her istek başka bir örneğe düşebilir) dağıtımda her örneğin kendi sayacı olur ve sınır gevşer.
 * O durumda paylaşılan bir depo (Redis / Upstash ya da Postgres tablosu) gerekir. Token 256 bit rastgele olduğundan
 * tahmin saldırısı zaten pratik değildir; bu sınır kötü niyetli tekrar ve yük içindir.
 *
 * Saf modül ("server-only" yok): testlenir; yalnız sunucu uçları kullanır.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Engellendiyse tekrar denemeye kalan saniye (Retry-After). */
  retryAfterSec: number;
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult;
  /** Test ve bakım: tutulan anahtar sayısı. */
  size(): number;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  /** Bellek sınırı: aşılınca süresi geçen anahtarlar, hâlâ fazlaysa en eskiler atılır. */
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  const prune = (now: number) => {
    for (const [key, times] of hits) {
      if (!times.length || times[times.length - 1] <= now - windowMs) hits.delete(key);
    }
    // Hâlâ fazlaysa ekleme sırasına göre en eskiler (Map sırası korunur).
    for (const key of hits.keys()) {
      if (hits.size <= maxKeys) break;
      hits.delete(key);
    }
  };

  return {
    hit(key, now = Date.now()) {
      const since = now - windowMs;
      const times = (hits.get(key) ?? []).filter((t) => t > since);
      if (times.length >= limit) {
        hits.set(key, times);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000)) };
      }
      times.push(now);
      // Yeniden ekleme: anahtar Map'in sonuna taşınır (en son kullanılan en geç atılır).
      hits.delete(key);
      hits.set(key, times);
      if (hits.size > maxKeys) prune(now);
      return { ok: true, retryAfterSec: 0 };
    },
    size: () => hits.size,
  };
}

/**
 * İstemci IP'si: vekil sunucunun yazdığı X-Forwarded-For'un ilk değeri, yoksa X-Real-IP. Uygulama doğrudan internete
 * açıksa bu başlıklar istemcinin elindedir (sahte IP ile sınır aşılabilir); vekil arkasında çalıştırın.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
