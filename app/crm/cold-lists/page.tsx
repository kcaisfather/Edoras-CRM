import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ColdListsPage } from "@/features/cold-lists";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmColdLists"), description: t("crmColdListsDescription") };
}

/** Soğuk listeler (Madde 13) — her CRM kullanıcısı (CRM_AGENT_PATHS "/crm"); liste silme yalnız yönetici. */
export default function CrmColdListsPage() {
  return (
    <div className="container mx-auto p-6">
      {/* Liste (?list=), sonuç süzgeci (?outcome=) ve arama (?q=) URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <ColdListsPage />
      </Suspense>
    </div>
  );
}
