import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstitutionLeadCard } from "@/features/crm";
import { InstitutionDetailPage } from "@/features/institutions/components/InstitutionDetailPage";
import { InstitutionSatisfactionCard } from "@/features/surveys";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("institutions.detail");
  return { title: t("title") };
}

export default async function InstitutionDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="container mx-auto p-6">
      {/*
        CRM adayı ve memnuniyet (anket) kartları burada verilir: kurumlar modülü CRM'i ve anketleri import etmez
        (bağımlılık tek yönlü). Memnuniyet kartı DeepSport profil başlığındaki rozetin karşılığı.
      */}
      <InstitutionDetailPage
        id={id}
        aside={
          <>
            <InstitutionLeadCard institutionId={id} />
            <InstitutionSatisfactionCard institutionId={id} />
          </>
        }
      />
    </div>
  );
}
