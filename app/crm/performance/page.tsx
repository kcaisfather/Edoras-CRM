import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesPerformance } from "@/features/performance";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmPerformance"), description: t("crmPerformanceDescription") };
}

export default function CrmPerformancePage() {
  return (
    <div className="container mx-auto p-6">
      {/* Dönem seçici URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <SalesPerformance />
      </Suspense>
    </div>
  );
}
