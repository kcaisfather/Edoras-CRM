import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CostOverviewPage } from "@/features/costs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("costs"), description: t("costsDescription") };
}

export default function Page() {
  return <CostOverviewPage />;
}
