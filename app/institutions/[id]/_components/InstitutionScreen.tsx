"use client";

import { InstitutionLeadCard } from "@/features/crm";
import { PaymentInvoiceAction } from "@/features/invoices";
import { InstitutionDetailPage } from "@/features/institutions/components/InstitutionDetailPage";
import { InstitutionSatisfactionCard } from "@/features/surveys";

/**
 * Kurum ayrıntısı + başka modüllerin parçaları. Kurumlar modülü CRM'i, anketleri ve faturaları import etmez (bağımlılık tek
 * yönlü); parçalar burada verilir. İstemci bileşeni: `renderPaymentAction` bir işlevdir, sunucu bileşeninden (route dosyası)
 * istemciye geçemez.
 *  - aside: CRM adayı ve memnuniyet (anket) kartları (memnuniyet, DeepSport profil başlığındaki rozetin karşılığı)
 *  - renderPaymentAction: ödeme satırlarında fatura durumu + "Fatura kes" (yalnız ADMIN'e çizilir)
 */
export function InstitutionScreen({ id }: { id: string }) {
  return (
    <InstitutionDetailPage
      id={id}
      renderPaymentAction={(payment, institution) => (
        <PaymentInvoiceAction institutionId={institution.id} paymentId={payment.id} licenseId={payment.licenseId} />
      )}
      aside={
        <>
          <InstitutionLeadCard institutionId={id} />
          <InstitutionSatisfactionCard institutionId={id} />
        </>
      }
    />
  );
}
