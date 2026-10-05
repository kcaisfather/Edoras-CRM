"use client";

import { useState } from "react";
import { CrmList } from "@/features/crm/components/CrmList";
import type { CrmLead } from "@/lib/domain/crm/types";
import { AssignTaskDialog, useAddToCallList } from "@/features/tasks";
import { ImportButton } from "@/features/cold-lists";
import { SatisfactionBadge, SendSurveyDialog, leadRecipient } from "@/features/surveys";
import { InvoiceDialog } from "@/features/invoices";

/**
 * Madde 7: memnuniyet rozeti — yalnız müşterinin anket yanıtından (salt okunur; aday ve bağlı kurumu birlikte). Tüm
 * satırlar tek istekle okunan dizinden (crm → surveys bağımlılığı olmasın diye burada).
 */
const renderSatisfaction = (lead: CrmLead) => <SatisfactionBadge leadId={lead.id} institutionId={lead.institutionId} />;

/**
 * Üst satırdaki "İçe aktar (Excel/CSV)" (DeepSport CrmList: hedef CRM adayı, istenirse soğuk liste). Aday listesi
 * içe aktarma bitince mutasyonun önbellek tazelemesiyle yenilenir (crm → cold-lists bağımlılığı olmasın diye burada).
 */
const renderImport = () => <ImportButton targets={["crm", "coldList"]} defaultTarget="crm" />;

/**
 * Adaylar ekranı + başka modüllerin parçaları (DeepSport app/[locale]/crm/_components/CrmList.tsx): "Görev ata" (görev
 * penceresi) ve "Arama listesine ekle" (bugüne Arama görevi; satırın tek İşlemler menüsü ve aday paneli), İçe aktar,
 * memnuniyet rozeti, "Anket gönder" (satır, mobil kart, aday detayı → anketler modülünün penceresi) ve "Fatura kes"
 * (ücretli kuruma bağlı aday; faturalar modülünün penceresi, satış pencerede seçilir).
 */
export function CrmScreen() {
  const [surveyLead, setSurveyLead] = useState<CrmLead | null>(null);
  const [invoiceLead, setInvoiceLead] = useState<CrmLead | null>(null);
  const [taskLead, setTaskLead] = useState<CrmLead | null>(null);
  const callList = useAddToCallList();
  return (
    <>
      <CrmList
        onAssignTask={setTaskLead}
        onAddToCallList={(lead) => void callList.add(lead)}
        renderSatisfaction={renderSatisfaction}
        onSendSurvey={setSurveyLead}
        onIssueInvoice={setInvoiceLead}
        renderImport={renderImport}
      />
      <AssignTaskDialog
        lead={taskLead}
        open={taskLead != null}
        onOpenChange={(next) => {
          if (!next) setTaskLead(null);
        }}
      />
      <InvoiceDialog
        target={invoiceLead?.institutionId ? { institutionId: invoiceLead.institutionId } : null}
        open={invoiceLead != null}
        onOpenChange={(next) => {
          if (!next) setInvoiceLead(null);
        }}
      />
      <SendSurveyDialog
        open={surveyLead != null}
        onOpenChange={(next) => {
          if (!next) setSurveyLead(null);
        }}
        recipients={surveyLead ? [leadRecipient(surveyLead)] : undefined}
      />
    </>
  );
}
