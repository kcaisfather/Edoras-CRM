"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, requireEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Tarayıcı istemcisi — YALNIZ oturum işleri (giriş, çıkış, şifre değiştirme). Veri okuma/yazma
 * bununla yapılmaz: CRM tablolarında politika yok, anon/authenticated rolü hiçbir şey göremez.
 * Veri her zaman /api/* uçlarından (sunucu, service_role) gelir.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  client ??= createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY)
  );
  return client;
}
