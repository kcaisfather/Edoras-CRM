"use client";

import { InstitutionLeadCard } from "@/features/crm";
import { InstitutionActivityHighlights, InstitutionStaffActivityCard, InstitutionUsageCard } from "@/features/growth";
import { PaymentInvoiceAction } from "@/features/invoices";
import { InstitutionDetailPage } from "@/features/institutions/components/InstitutionDetailPage";
import { InstitutionSatisfactionCard } from "@/features/surveys";
import { InstitutionTicketsCard } from "@/features/tickets";

/**
 * Kurum ayrıntısı + başka modüllerin parçaları. Kurumlar modülü CRM'i, anketleri ve faturaları import etmez (bağımlılık tek
 * yönlü); parçalar burada verilir. İstemci bileşeni: `renderPaymentAction` bir işlevdir, sunucu bileşeninden (route dosyası)
 * istemciye geçemez.
 *  - highlights: başlıktaki gösterge şeridine etkinlik + son etkinlik kutucukları (müşteri analizleri)
 *  - overviewMain: Genel bakış ana sütunu — destek talepleri (tablo; geniş sütunda okunur)
 *  - overviewAside: Genel bakış yan sütunu — CRM adayı (notlar), memnuniyet (anket), özellik kullanımı
 *  - staff: "Öğretmen kullanımı" sekmesi (personel × işlem tablosu; yalnız sekme açılınca okunur)
 *  - renderPaymentAction: ödeme satırlarında fatura durumu + "Fatura kes" (yalnız ADMIN'e çizilir)
 */
export function InstitutionScreen({ id }: { id: string }) {
  return (
    <InstitutionDetailPage
      id={id}
      renderPaymentAction={(payment, institution) => (
        <PaymentInvoiceAction institutionId={institution.id} paymentId={payment.id} licenseId={payment.licenseId} />
      )}
      highlights={<InstitutionActivityHighlights institutionId={id} />}
      overviewMain={<InstitutionTicketsCard institutionId={id} />}
      overviewAside={
        <>
          <InstitutionLeadCard institutionId={id} />
          <InstitutionSatisfactionCard institutionId={id} />
          <InstitutionUsageCard institutionId={id} />
        </>
      }
      staff={<InstitutionStaffActivityCard institutionId={id} />}
    />
  );
}
