import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

describe("createRateLimiter (kayan pencere)", () => {
  it("pencerede sınır kadar izin verir, sonra kalan süreyi söyler", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect([0, 1_000, 2_000].map((t) => rl.hit("ip:tok", t).ok)).toEqual([true, true, true]);
    expect(rl.hit("ip:tok", 3_000)).toEqual({ ok: false, retryAfterSec: 57 });
    // Başka anahtar etkilenmez.
    expect(rl.hit("ip:other", 3_000).ok).toBe(true);
    // İlk istek pencereden çıkınca bir yer açılır.
    expect(rl.hit("ip:tok", 60_001).ok).toBe(true);
    expect(rl.hit("ip:tok", 60_002).ok).toBe(false);
  });

  it("bellek sınırlı: süresi geçen ve en eski anahtarlar atılır", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 3 });
    rl.hit("a", 0);
    rl.hit("b", 0);
    rl.hit("c", 0);
    rl.hit("d", 5_000);
    expect(rl.size()).toBeLessThanOrEqual(3);
    for (let i = 0; i < 10; i++) rl.hit(`k${i}`, 6_000);
    expect(rl.size()).toBeLessThanOrEqual(3);
    // En son kullanılan tutulur.
    expect(rl.hit("k9", 6_001).ok).toBe(false);
  });
});

describe("clientIp", () => {
  it("X-Forwarded-For'un ilk değeri, yoksa X-Real-IP, yoksa unknown", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 1.2.3.4 , 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
