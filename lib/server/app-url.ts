import "server-only";

import { APP_URL } from "@/lib/env";

/**
 * Herkese açık linklerin kökü (anket e-postası): NEXT_PUBLIC_APP_URL, yoksa isteğin adresi (vekil arkasında
 * X-Forwarded-Host / -Proto). Üretimde NEXT_PUBLIC_APP_URL tanımlanmalı: başlıklar vekil sunucuya bağlıdır.
 */
export function appOrigin(request: Request): string {
  if (APP_URL) return APP_URL;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (host) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
