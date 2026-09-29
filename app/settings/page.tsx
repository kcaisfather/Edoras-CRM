import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPage } from "@/features/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default function SettingsRoutePage() {
  return (
    <div className="container mx-auto p-6">
      {/* Sekme URL'de (?tab=) — useSearchParams istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <SettingsPage />
      </Suspense>
    </div>
  );
}
