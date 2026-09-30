import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerAnalyticsPage } from "@/features/growth/components/CustomerAnalyticsPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("growthAnalytics"), description: t("growthAnalyticsDescription") };
}

export default function GrowthAnalyticsRoutePage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      {/* Pencere, bölüm ve süzgeçler URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <CustomerAnalyticsPage />
      </Suspense>
    </div>
  );
}
