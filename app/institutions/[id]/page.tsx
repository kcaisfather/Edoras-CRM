import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstitutionLeadCard } from "@/features/crm";
import { InstitutionDetailPage } from "@/features/institutions/components/InstitutionDetailPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutions.detail");
  return { title: t("title") };
}

export default async function InstitutionDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="container mx-auto p-6">
      {/* CRM adayı kartı burada verilir: kurumlar modülü CRM'i import etmez (bağımlılık tek yönlü). */}
      <InstitutionDetailPage id={id} aside={<InstitutionLeadCard institutionId={id} />} />
    </div>
  );
}
