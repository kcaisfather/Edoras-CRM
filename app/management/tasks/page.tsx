import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ManagementTasksPage } from "@/features/management";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("managementTasks"), description: t("managementTasksDescription") };
}

/** Yönetim Görevleri — KCA Panel'deki Edoras görevleri (her CRM kullanıcısı; veri bağlı KCA hesabının yetkisiyle). */
export default function ManagementTasksRoute() {
  return (
    <div className="container mx-auto p-6">
      {/* Açık görev (?task=) URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <ManagementTasksPage />
      </Suspense>
    </div>
  );
}
