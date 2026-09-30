/**
 * Eşzamanlı çalışan asenkron işlem sayısını sınırlar (kuyruk sırası korunur). Edoras'a giden okuma isteklerini
 * (lib/server/edoras-usage.ts) yığmamak için kullanılır. Bir işlem hata verse de yuva serbest kalır.
 */
export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
  const capacity = Math.max(1, Math.floor(max));
  let active = 0;
  const queue: (() => void)[] = [];
  const release = () => {
    active -= 1;
    queue.shift()?.();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // Yuva sırayla devredilir: `release` uyandırdığı işlemin yerine geçer, sayaç taşmaz.
    while (active >= capacity) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
