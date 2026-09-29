import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { CrmAnalytics } from "@/features/crm/components/CrmAnalytics";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmAnalytics"), description: t("crmAnalyticsDescription") };
}

export default function CrmAnalyticsPage() {
  return (
    <div className="container mx-auto p-6">
      {/* Dönem seçici URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <CrmAnalytics />
      </Suspense>
    </div>
  );
}
