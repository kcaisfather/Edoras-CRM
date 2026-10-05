import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicTicketPage } from "@/features/tickets/components/PublicTicketPage";

/**
 * HERKESE AÇIK destek formu (/t/[token]) — oturum yok, panel kabuğu yok (lib/permissions.ts → CUSTOMER_PUBLIC_PATHS;
 * proxy.ts oturum çerezine dokunmaz, /login'e yollamaz). Arama motorlarına kapalı; token URL'de olduğu için referrer
 * gönderilmez. Veri istemcide /api/public/tickets/{token}'dan okunur.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tickets.public");
  return {
    title: { absolute: t("metaTitle") },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function PublicTicketRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let decoded = token;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    // Bozuk kodlama: token olduğu gibi gider, uç 404 döner.
  }
  return <PublicTicketPage token={decoded} />;
}
