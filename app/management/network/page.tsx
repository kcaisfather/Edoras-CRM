import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ManagementNetworkPage } from "@/features/management";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("managementNetwork"), description: t("managementNetworkDescription") };
}

/** Network — kişinin KCA Panel networkündeki Edoras firmalı kişiler (kişiye özel). */
export default function ManagementNetworkRoute() {
  return (
    <div className="container mx-auto p-6">
      <ManagementNetworkPage />
    </div>
  );
}
