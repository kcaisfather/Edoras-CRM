/**
 * Toplu yazma yürütücüsü (DeepSport lib/import/run.ts): istekler SIRAYLA gider (sunucuyu yormamak ve durdurulabilir
 * olmak için), her adımda ilerleme bildirilir, `shouldStop` true dönünce kalanlar gönderilmez. İçe aktarma
 * parçaları (500'er satırlık toplu istekler), birleştirmeler ve biriken arama sonuçları bunu kullanır.
 */

export interface BulkFailure<T> {
  item: T;
  index: number;
  /** Ham hata (ApiError vb.). Kullanıcı metnine gösterim katmanında çevrilir; sunucu metni doğrudan basılmaz. */
  error: unknown;
}

export interface BulkResult<T> {
  ok: number;
  failed: BulkFailure<T>[];
  /** Kullanıcı durdurduysa true; `remaining` gönderilmeyen öğe sayısı. */
  stopped: boolean;
  remaining: number;
  /** Art arda `maxConsecutiveFailures` hata sonrası güvenlik durdurması (ağ/yetki sorunu). */
  aborted?: boolean;
}

export interface RunOptions {
  onProgress?: (done: number, total: number) => void;
  shouldStop?: () => boolean;
  /** Bu kadar art arda hata olursa kalanlar gönderilmez (varsayılan 5; 0 = sınırsız). */
  maxConsecutiveFailures?: number;
}

export async function runSequential<T>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<unknown>,
  { onProgress, shouldStop, maxConsecutiveFailures = 5 }: RunOptions = {}
): Promise<BulkResult<T>> {
  let ok = 0;
  let streak = 0;
  const failed: BulkFailure<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    if (shouldStop?.()) {
      return { ok, failed, stopped: true, remaining: items.length - i };
    }
    try {
      await task(items[i], i);
      ok++;
      streak = 0;
    } catch (e) {
      failed.push({ item: items[i], index: i, error: e });
      streak++;
    }
    onProgress?.(i + 1, items.length);
    if (maxConsecutiveFailures > 0 && streak >= maxConsecutiveFailures && i + 1 < items.length) {
      return { ok, failed, stopped: true, remaining: items.length - i - 1, aborted: true };
    }
  }
  return { ok, failed, stopped: false, remaining: 0 };
}

/** Diziyi en çok `size` öğelik parçalara böler (toplu istek sınırı). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
