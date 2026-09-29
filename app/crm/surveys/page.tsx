import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SurveysPage } from "@/features/surveys";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmSurveys"), description: t("crmSurveysDescription") };
}

/** Anketler (madde 6–7) — her CRM kullanıcısı (CRM_AGENT_PATHS "/crm"; DeepSport'ta da ADMIN ve CRM_AGENT). */
export default function CrmSurveysPage() {
  return (
    <div className="container mx-auto p-6">
      <SurveysPage />
    </div>
  );
}
