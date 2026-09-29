import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsPage } from "@/features/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default function SettingsRoutePage() {
  return (
    <div className="container mx-auto p-6">
      <SettingsPage />
    </div>
  );
}
