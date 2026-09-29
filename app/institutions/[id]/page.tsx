import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstitutionDetailPage } from "@/features/institutions/components/InstitutionDetailPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutions.detail");
  return { title: t("title") };
}

export default async function InstitutionDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="container mx-auto p-6">
      <InstitutionDetailPage id={id} />
    </div>
  );
}
