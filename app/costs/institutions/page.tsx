import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { CostInstitutionsPage } from "@/features/costs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("costsInstitutions"), description: t("costsDescription") };
}

export default function Page() {
  // Ay, süzgeç ve sayfa URL'de (useSearchParams) — istemcide çözülür.
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <CostInstitutionsPage />
    </Suspense>
  );
}
