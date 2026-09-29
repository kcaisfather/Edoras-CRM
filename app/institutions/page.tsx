import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { InstitutionsPage } from "@/features/institutions/components/InstitutionsPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutions.list");
  return { title: t("title"), description: t("description") };
}

export default function InstitutionsRoutePage() {
  return (
    <div className="container mx-auto p-6">
      {/* Süzgeç ve arama URL'de (useSearchParams) — istemci tarafında çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <InstitutionsPage />
      </Suspense>
    </div>
  );
}
