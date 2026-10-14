import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ManagementMeetingsPage } from "@/features/management";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("managementMeetings"), description: t("managementMeetingsDescription") };
}

/** Toplantı Notları — KCA Panel ile ortak, yalnız Edoras firmalı notlar. */
export default function ManagementMeetingsRoute() {
  return (
    <div className="container mx-auto p-6">
      {/* Açık toplantı (?meeting=) URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <ManagementMeetingsPage />
      </Suspense>
    </div>
  );
}
