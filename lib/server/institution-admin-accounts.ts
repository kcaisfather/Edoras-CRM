import "server-only";

import { randomInt } from "node:crypto";
import type { StaffContext } from "@/lib/api/server";
import { EDORAS_PANEL_URL } from "@/lib/env";
import { generateTemporaryPassword } from "@/lib/domain/institutions/rules";
import {
  edorasLoginKind,
  loginIdentifierFor,
  type AdminActiveChangeResult,
  type AdminActiveInput,
  type AdminEmailChangeResult,
  type AdminEmailInput,
  type AdminPasswordReset,
  type AdminPasswordResetOutput,
} from "@/lib/domain/institutions/edoras-accounts";
import { recordAudit } from "./audit";
import { getEdorasInstitution, setEdorasAdminActive, setEdorasAdminPassword, updateEdorasAdminEmail } from "./edoras";

/**
 * Kurum ayrıntısı → "Kurum yöneticileri" hesap işlemleri (yalnız ADMIN; uçlar `requireStaff({ role: "ADMIN" })`):
 * giriş e-postası, şifre sıfırlama, aktif / pasif. Edoras erişimi ve kurallar `edoras.ts`'te (üyelik kapısı, süper
 * yönetici, telefon / TC girişi, son aktif yönetici); burası şifreyi üretir ve işlem kaydını yazar. CRM kaydı ŞART
 * DEĞİL — kurum Edoras'ta olsun yeter. İşlem kaydına e-posta / şifre yazılmaz: yalnız Edoras kullanıcı kimliği.
 */

async function institutionLabel(institutionId: string): Promise<string | null> {
  return (await getEdorasInstitution(institutionId))?.name ?? null;
}

export async function changeAdminEmail(
  institutionId: string,
  userId: string,
  input: AdminEmailInput,
  staff: StaffContext
): Promise<AdminEmailChangeResult> {
  const result = await updateEdorasAdminEmail(institutionId, userId, input.email);
  if (result.changed) {
    await recordAudit(staff, {
      action: "EDORAS_ADMIN_EMAIL_CHANGED",
      entityType: "institution",
      entityId: institutionId,
      entityLabel: await institutionLabel(institutionId),
      details: { userId },
    });
  }
  return result;
}

/**
 * Yeni şifre: CRM personeli yazdıysa o (2026-10-13 — Edoras panelinden yönetici şifresi belirlenmez, yalnız buradan),
 * yoksa güçlü geçici şifre (demo şifresiyle aynı üretici). Yanıtta bir kez döner; hiçbir yerde saklanmaz, loglanmaz.
 */
export async function resetAdminPassword(
  institutionId: string,
  userId: string,
  input: AdminPasswordResetOutput,
  staff: StaffContext
): Promise<AdminPasswordReset> {
  const passwordChosen = input.password !== undefined;
  const temporaryPassword = input.password ?? generateTemporaryPassword((max) => randomInt(max));
  const { authEmail } = await setEdorasAdminPassword(institutionId, userId, temporaryPassword);
  await recordAudit(staff, {
    action: "EDORAS_ADMIN_PASSWORD_RESET",
    entityType: "institution",
    entityId: institutionId,
    entityLabel: await institutionLabel(institutionId),
    details: { userId, passwordChosen },
  });
  return {
    loginIdentifier: authEmail ? loginIdentifierFor(authEmail) : "",
    loginKind: edorasLoginKind(authEmail),
    temporaryPassword,
    passwordChosen,
    panelUrl: EDORAS_PANEL_URL,
  };
}

export async function changeAdminActive(
  institutionId: string,
  userId: string,
  input: AdminActiveInput,
  staff: StaffContext
): Promise<AdminActiveChangeResult> {
  const result = await setEdorasAdminActive(institutionId, userId, input.active, input.confirmLastAdmin === true);
  if (result.changed) {
    await recordAudit(staff, {
      action: "EDORAS_ADMIN_ACTIVE_CHANGED",
      entityType: "institution",
      entityId: institutionId,
      entityLabel: await institutionLabel(institutionId),
      details: { userId, active: input.active },
    });
  }
  return result;
}
