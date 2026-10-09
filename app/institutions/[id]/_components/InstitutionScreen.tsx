"use client";

import { InstitutionLeadCard } from "@/features/crm";
import { InstitutionStaffActivityCard, InstitutionUsageCard } from "@/features/growth";
import { PaymentInvoiceAction } from "@/features/invoices";
import { InstitutionDetailPage } from "@/features/institutions/components/InstitutionDetailPage";
import { InstitutionSatisfactionCard } from "@/features/surveys";
import { InstitutionTicketsCard } from "@/features/tickets";

/**
 * Kurum ayrıntısı + başka modüllerin parçaları. Kurumlar modülü CRM'i, anketleri ve faturaları import etmez (bağımlılık tek
 * yönlü); parçalar burada verilir. İstemci bileşeni: `renderPaymentAction` bir işlevdir, sunucu bileşeninden (route dosyası)
 * istemciye geçemez.
 *  - aside: CRM adayı, kullanım (etkinlik; müşteri analizleri) ve memnuniyet (anket) ve destek talebi kartları (memnuniyet, DeepSport profil başlığındaki rozetin karşılığı)
 *  - footer: öğretmen kullanımı (personel × işlem tablosu; geniş olduğu için ızgaranın altında, tam genişlik)
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
          <InstitutionUsageCard institutionId={id} />
          <InstitutionSatisfactionCard institutionId={id} />
          <InstitutionTicketsCard institutionId={id} />
        </>
      }
      footer={<InstitutionStaffActivityCard institutionId={id} />}
    />
  );
}
