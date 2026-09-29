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
