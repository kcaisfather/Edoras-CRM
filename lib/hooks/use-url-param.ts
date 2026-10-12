"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";

/** Tek bir URL arama parametresini okuyup yazar (boş değer parametreyi siler). */
export function useUrlParam(key: string, fallback = ""): [string, (value: string) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const value = searchParams.get(key) ?? fallback;
  const setValue = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== fallback) params.set(key, next);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };
  return [value, setValue];
}

/**
 * Birden çok URL parametresini TEK geçişte yazar (boş/null değer siler). Ardışık `useUrlParam` setter'ları aynı
 * eski `searchParams`'tan başladığı için ikincisi birincisini ezer (ör. "il değişti → ilçeyi sıfırla", "tümünü
 * temizle"); bu durumlarda bunu kullanın.
 */
export function useUrlParamsSetter(): (updates: Record<string, string | null | undefined>) => void {
  const searchParams = useSearchParams();
  const router = useRouter();
  return (updates) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, next] of Object.entries(updates)) {
      if (next) params.set(key, next);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };
}
