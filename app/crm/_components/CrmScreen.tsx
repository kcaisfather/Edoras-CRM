"use client";

import { CrmList } from "@/features/crm/components/CrmList";
import type { CrmLead } from "@/lib/domain/crm/types";
import { AssignTaskMenu } from "@/features/tasks";

/** Aday satırlarının "Görev ata" parçası (crm → tasks bağımlılığı olmasın diye ekranı kuran yer verir). */
const renderAssignTask = (lead: CrmLead, opts?: { showLabel?: boolean }) => <AssignTaskMenu lead={lead} showLabel={opts?.showLabel} />;

/** Adaylar ekranı + başka modüllerin satır parçaları (DeepSport app/[locale]/crm/_components/CrmList.tsx). */
export function CrmScreen() {
  return <CrmList renderAssignTask={renderAssignTask} />;
}
