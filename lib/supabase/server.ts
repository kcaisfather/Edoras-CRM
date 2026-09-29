import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, requireEnv } from "@/lib/env";
import { SERVER_REALTIME } from "./realtime";

/**
 * İki veritabanı:
 *   - CRM (bu uygulamanın kendi Supabase projesi): CRM personel girişi + crm_* tabloları.
 *   - Edoras (edoras-admin ve mobilin canlı veritabanı): kurum listesi, kullanım sayıları, demo açarken
 *     kurum + kurum yöneticisi oluşturma. Yalnız sunucudan, lib/server/edoras.ts üzerinden.
 * İki service_role anahtarı da tarayıcıya asla gitmez (NEXT_PUBLIC_ değil; bu dosya "server-only").
 */

/** CRM projesi — çerezdeki oturumla çalışan istemci; yalnız "bu istek kimden geliyor" sorusu için. */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    {
      realtime: SERVER_REALTIME,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component render'ında çerez yazılamaz; oturumu proxy.ts tazeler.
          }
        },
      },
    }
  );
}

let crmAdmin: SupabaseClient | null = null;
let edorasAdmin: SupabaseClient | null = null;

/** CRM projesi service_role istemcisi (RLS'i atlar). YALNIZ `requireStaff()` kapısından sonra. */
export function getSupabaseAdminClient(): SupabaseClient {
  crmAdmin ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false }, realtime: SERVER_REALTIME }
  );
  return crmAdmin;
}

/**
 * Edoras canlı veritabanı service_role istemcisi. YALNIZ `requireStaff()` kapısından sonra ve
 * lib/server/edoras.ts içinden kullanılır: Edoras şemasına dokunan kod tek dosyada toplanır.
 */
export function getEdorasAdminClient(): SupabaseClient {
  edorasAdmin ??= createClient(
    requireEnv("EDORAS_SUPABASE_URL", process.env.EDORAS_SUPABASE_URL),
    requireEnv("EDORAS_SUPABASE_SERVICE_ROLE_KEY", process.env.EDORAS_SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false }, realtime: SERVER_REALTIME }
  );
  return edorasAdmin;
}
