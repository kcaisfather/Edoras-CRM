import "server-only";

import type { StaffContext } from "@/lib/api/server";
import type { PanelModuleState, PanelModuleToggleInput } from "@/lib/domain/institutions/panel-modules";
import { recordAudit } from "./audit";
import { getEdorasInstitution, getEdorasPanelModules, setEdorasPanelModule } from "./edoras";

/**
 * Kurum ayrıntısı → "Panel modülleri" (GET/PATCH /api/institutions/{id}/modules). Edoras erişimi edoras.ts'te;
 * burası yalnız iz alanını kurar ve işlem kaydını yazar. Kurumun CRM kaydı ŞART DEĞİL (CRM öncesi açılmış kurumda
 * da modül açılabilir) — Edoras'ta var olması yeter.
 */
export function listPanelModules(institutionId: string): Promise<PanelModuleState[]> {
  return getEdorasPanelModules(institutionId);
}

export async function setPanelModule(
  institutionId: string,
  input: PanelModuleToggleInput,
  staff: StaffContext
): Promise<PanelModuleState[]> {
  // Edoras tarafındaki iz: kimin açtığı Edoras panelinden de görünsün (e-posta değil ad; yoksa kullanıcı kimliği).
  const updatedBy = `crm:${staff.fullName?.trim() || staff.userId}`;
  const modules = await setEdorasPanelModule(institutionId, input.key, input.enabled, updatedBy);
  const institution = await getEdorasInstitution(institutionId);
  await recordAudit(staff, {
    action: "PANEL_MODULE_CHANGED",
    entityType: "institution",
    entityId: institutionId,
    entityLabel: institution?.name ?? null,
    details: { module: input.key, enabled: input.enabled },
  });
  return modules;
}
