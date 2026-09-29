/** crm — adaylar; diğer feature'ların, paylaşılan bileşenlerin ve sayfaların kullandığı genel yüzey (public API). */
export { StatusBadge, ToneBadge } from "./components/CrmBadges";
export { CrmContactMenu, contactTargetFor } from "./components/CrmContactMenu";
export { InstitutionLeadCard } from "./components/InstitutionLeadCard";
export { OpenReceivablesCard } from "./components/OpenReceivablesCard";
export { useCreateCrmLead, useUpdateCrmLead } from "./mutations";
export { crmKeys, useAllCrmLeads, useLeadForInstitution } from "./queries";
