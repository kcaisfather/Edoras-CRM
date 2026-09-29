import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Dashboard } from "@/features/dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title"), description: t("description") };
}

export default function DashboardPage() {
  return (
    <div className="container mx-auto p-6">
      <Dashboard />
    </div>
  );
}
