import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { CrmList } from "@/features/crm/components/CrmList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmLeads"), description: t("crmLeadsDescription") };
}

export default function CrmPage() {
  return (
    <div className="container mx-auto p-6">
      {/* Dönem, süzgeç, arama, sayfa ve açık aday URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <CrmList />
      </Suspense>
    </div>
  );
}
