/** crm — adaylar; diğer feature'ların, paylaşılan bileşenlerin ve sayfaların kullandığı genel yüzey (public API). */
export { StatusBadge, ToneBadge } from "./components/CrmBadges";
export { CrmContactMenu, contactTargetFor } from "./components/CrmContactMenu";
export { CrmLeadSheet, type CrmLeadSheetProps } from "./components/CrmLeadSheet";
export { CrmErrorState } from "./components/CrmErrorState";
export { CrmFollowUpFields } from "./components/CrmFollowUpFields";
export { CrmNoteModal } from "./components/CrmNoteModal";
export { StatusDropdown } from "./components/StatusDropdown";
export { InstitutionLeadCard } from "./components/InstitutionLeadCard";
export { OpenReceivablesCard } from "./components/OpenReceivablesCard";
export { useCreateCrmLead, useUpdateCrmLead } from "./mutations";
export { crmKeys, useAllCrmLeads, useCrmRules, useLeadForInstitution } from "./queries";
export type { CrmRowSlots, CrmScreenSlots, CrmTableActions } from "./types";
