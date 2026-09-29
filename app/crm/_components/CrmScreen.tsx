"use client";

import { CrmList } from "@/features/crm/components/CrmList";
import type { CrmLead } from "@/lib/domain/crm/types";
import { AssignTaskMenu } from "@/features/tasks";
import { ImportButton } from "@/features/cold-lists";

/** Aday satırlarının "Görev ata" parçası (crm → tasks bağımlılığı olmasın diye ekranı kuran yer verir). */
const renderAssignTask = (lead: CrmLead, opts?: { showLabel?: boolean }) => <AssignTaskMenu lead={lead} showLabel={opts?.showLabel} />;

/**
 * Üst satırdaki "İçe aktar (Excel/CSV)" (DeepSport CrmList: hedef CRM adayı, istenirse soğuk liste). Aday listesi
 * içe aktarma bitince mutasyonun önbellek tazelemesiyle yenilenir (crm → cold-lists bağımlılığı olmasın diye burada).
 */
const renderImport = () => <ImportButton targets={["crm", "coldList"]} defaultTarget="crm" />;

/** Adaylar ekranı + başka modüllerin parçaları (DeepSport app/[locale]/crm/_components/CrmList.tsx). */
export function CrmScreen() {
  return <CrmList renderAssignTask={renderAssignTask} renderImport={renderImport} />;
}
