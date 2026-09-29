import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Edoras Supabase Storage (kurum logoları vb.)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  compress: true,
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
