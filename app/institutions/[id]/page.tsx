import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstitutionScreen } from "./_components/InstitutionScreen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutions.detail");
  return { title: t("title") };
}

export default async function InstitutionDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="container mx-auto p-6">
      {/* CRM adayı, memnuniyet ve "Fatura kes" parçaları InstitutionScreen'de verilir (kurumlar modülü onları import etmez). */}
      <InstitutionScreen id={id} />
    </div>
  );
}
