import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** URL'den ana makine adı; boş/bozuksa "". */
function hostnameOf(url: string | undefined): string {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return "";
  }
}

/**
 * Görsel kaynakları (next/image): canlıda Supabase Storage `*.supabase.co` (Vercel'de değişmez). Türkiye
 * kopyasında Supabase kendi alan adında çalışır → ana makine adı derleme anında env'den eklenir:
 *   NEXT_PUBLIC_SUPABASE_URL          CRM yığını (tr-crm-api…)
 *   NEXT_PUBLIC_EDORAS_STORAGE_URL    kurum logolarının geldiği PANEL yığını (tr-api…). Yalnız bu dosya okur;
 *                                     çalışma zamanındaki EDORAS_SUPABASE_URL ile aynı adres ama o, sır
 *                                     listesiyle birlikte yalnız Coolify ortamında durur, derlemeye verilmez.
 * `*.supabase.co` olanlar zaten ilk desende; tekrar eklenmez.
 */
const customImageHosts = Array.from(
  new Set(
    [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_EDORAS_STORAGE_URL]
      .map(hostnameOf)
      .filter((host) => host && !host.endsWith(".supabase.co"))
  )
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Edoras Supabase Storage (kurum logoları vb.)
      { protocol: "https", hostname: "*.supabase.co" },
      ...customImageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
    ],
  },
  compress: true,
  poweredByHeader: false,
  // Türkiye kopyası (Coolify, Docker): .next/standalone + server.js. Vercel'de kapalı (değişken yok).
  ...(process.env.EDORAS_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Türkiye kopyası gizli kalır (tr-* adresleri arama motorlarına kapalı): Dockerfile EDORAS_NOINDEX=1.
  ...(process.env.EDORAS_NOINDEX === "1"
    ? {
        async headers() {
          return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
        },
      }
    : {}),
};

export default withNextIntl(nextConfig);
