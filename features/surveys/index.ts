/**
 * surveys — Anketler (madde 6–7); diğer ekranların kullandığı genel yüzey (public API). crm bu modülü import etmez:
 * satır parçaları ekranı kuran yerden verilir (app/crm/_components/CrmScreen.tsx, kurum sayfası `aside`).
 *
 * - <SatisfactionBadge leadId institutionId /> : salt okunur memnuniyet rozeti (yalnızca müşterinin anket yanıtından)
 * - <SurveyReminderButton leadId phone name /> : "Anket araması" — yanıtsız daveti WhatsApp ile tekrar gönder
 * - <SendSurveyDialog open onOpenChange recipients? /> : kişiye / toplu anket gönder
 * - <InstitutionSatisfactionCard institutionId /> : kurum ayrıntısındaki memnuniyet kartı
 * - leadRecipient(lead) : CRM satırından alıcı
 */
export { InstitutionSatisfactionCard } from "./components/InstitutionSatisfactionCard";
// Herkese açık sayfa (PublicSurveyPage) bilinçli olarak burada YOK: app/s/[token] onu doğrudan alır, müşterinin
// indirdiği sayfaya bu barrel'ın panel bileşenleri girmesin.
export { SatisfactionBadge, SurveyReminderButton } from "./components/SatisfactionBadge";
export { SendSurveyDialog } from "./components/SendSurveyDialog";
export { SurveysPage } from "./components/SurveysPage";
export { useDefaultSurvey, surveyKeys } from "./queries";
export { leadRecipient } from "./recipients";
