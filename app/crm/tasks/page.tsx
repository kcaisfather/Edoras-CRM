import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { TasksPage } from "@/features/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmTasks"), description: t("crmTasksDescription") };
}

export default function CrmTasksPage() {
  return (
    <div className="container mx-auto p-6">
      {/* Kova (?b=) ve arama (?q=) URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <TasksPage />
      </Suspense>
    </div>
  );
}
