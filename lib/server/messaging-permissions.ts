import "server-only";

import type { StaffContext } from "@/lib/api/server";
import type {
  MessagingPermissions,
  MessagingSettingToggleInput,
  TeacherMessagingScopeInput,
} from "@/lib/domain/institutions/messaging-permissions";
import { recordAudit } from "./audit";
import {
  getEdorasInstitution,
  getEdorasMessagingPermissions,
  setEdorasMessagingSetting,
  setEdorasTeacherMessagingScope,
} from "./edoras";

/**
 * Kurum ayrıntısı → "Mesajlaşma yetkileri" (GET/PATCH /api/institutions/{id}/messaging[/teachers]). Edoras erişimi
 * edoras.ts'te; burası yalnız işlem kaydını yazar. Panel modülleri gibi kurumun CRM kaydı ŞART DEĞİL.
 */
export function listMessagingPermissions(institutionId: string): Promise<MessagingPermissions> {
  return getEdorasMessagingPermissions(institutionId);
}

export async function setMessagingSetting(
  institutionId: string,
  input: MessagingSettingToggleInput,
  staff: StaffContext
): Promise<MessagingPermissions> {
  const state = await setEdorasMessagingSetting(institutionId, input.key, input.enabled);
  const institution = await getEdorasInstitution(institutionId);
  await recordAudit(staff, {
    action: "MESSAGING_SETTING_CHANGED",
    entityType: "institution",
    entityId: institutionId,
    entityLabel: institution?.name ?? null,
    details: { setting: input.key, enabled: input.enabled },
  });
  return state;
}

export async function setTeacherMessagingScope(
  institutionId: string,
  input: TeacherMessagingScopeInput,
  staff: StaffContext
): Promise<MessagingPermissions> {
  const { previous, state } = await setEdorasTeacherMessagingScope(institutionId, input.institutionUserId, input.scope);
  // Değer zaten istenen değerse Edoras'a yazılmadı → kayıt da yok.
  if (previous !== input.scope) {
    const institution = await getEdorasInstitution(institutionId);
    await recordAudit(staff, {
      action: "TEACHER_MESSAGING_SCOPE_CHANGED",
      entityType: "institution",
      entityId: institutionId,
      entityLabel: institution?.name ?? null,
      details: { membership: input.institutionUserId, from: previous, to: input.scope },
    });
  }
  return state;
}
