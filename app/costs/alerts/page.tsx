import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CostAlertsPage } from "@/features/costs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("costsAlerts"), description: t("costsDescription") };
}

export default function Page() {
  return <CostAlertsPage />;
}
