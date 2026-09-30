import { describe, expect, it } from "vitest";
import { createLimiter } from "./limiter";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createLimiter", () => {
  it("aynı anda en çok `max` işlem çalıştırır ve hepsini tamamlar", async () => {
    const limit = createLimiter(3);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        limit(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await tick();
          running -= 1;
          return i;
        })
      )
    );
    expect(results).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(peak).toBe(3);
  });

  it("hata veren işlem yuvayı serbest bırakır, sonuçları etkilemez", async () => {
    const limit = createLimiter(1);
    const failing = limit(async () => {
      throw new Error("x");
    });
    const after = limit(async () => "ok");
    await expect(failing).rejects.toThrow("x");
    await expect(after).resolves.toBe("ok");
  });

  it("kuyruk sırası korunur", async () => {
    const limit = createLimiter(1);
    const order: number[] = [];
    await Promise.all([1, 2, 3, 4].map((n) => limit(async () => void order.push(n))));
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("geçersiz sınır en az 1'e çekilir", async () => {
    const limit = createLimiter(0);
    await expect(limit(async () => 5)).resolves.toBe(5);
  });
});
