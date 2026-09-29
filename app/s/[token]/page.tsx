import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicSurveyPage } from "@/features/surveys/components/PublicSurveyPage";

/**
 * HERKESE AÇIK anket sayfası (/s/[token]) — oturum yok, panel kabuğu yok (lib/permissions.ts → CUSTOMER_PUBLIC_PATHS;
 * proxy.ts oturum çerezine dokunmaz, /login'e yollamaz). Arama motorlarına kapalı; token URL'de olduğu için referrer
 * gönderilmez. Veri istemcide /api/public/surveys/{token}'dan okunur: bağlantı önizlemesi yapan botlar (WhatsApp vb.)
 * JavaScript çalıştırmadığı için daveti "Açıldı" yapmaz.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("surveys.public");
  return {
    title: { absolute: t("metaTitle") },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function PublicSurveyRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let decoded = token;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    // Bozuk kodlama: token olduğu gibi gider, uç 404 döner.
  }
  return <PublicSurveyPage token={decoded} />;
}
