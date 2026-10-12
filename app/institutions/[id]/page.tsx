import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstitutionDetailSkeleton } from "@/features/institutions/components/InstitutionDetailPage";
import { InstitutionScreen } from "./_components/InstitutionScreen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutions.detail");
  return { title: t("title") };
}

export default async function InstitutionDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="container mx-auto p-4 sm:p-6">
      {/* CRM adayı, memnuniyet ve "Fatura kes" parçaları InstitutionScreen'de verilir (kurumlar modülü onları import etmez).
          Suspense: sekme URL'de (?tab=), useSearchParams okur. */}
      <Suspense fallback={<InstitutionDetailSkeleton />}>
        <InstitutionScreen id={id} />
      </Suspense>
    </div>
  );
}
