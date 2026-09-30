import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityHistoryPage } from "@/features/activity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("activityHistory"), description: t("activityHistoryDescription") };
}

export default function ActivityHistoryRoutePage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Kapsam, süzgeçler ve sayfa URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <ActivityHistoryPage />
      </Suspense>
    </div>
  );
}
