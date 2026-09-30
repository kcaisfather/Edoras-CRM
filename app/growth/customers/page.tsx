import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomersPage } from "@/features/growth/components/CustomersPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("growthCustomers"), description: t("growthCustomersDescription") };
}

export default function GrowthCustomersRoutePage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      {/* Sekme, süzgeç, arama ve sıralama URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <CustomersPage />
      </Suspense>
    </div>
  );
}
