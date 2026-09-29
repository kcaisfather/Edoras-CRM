/**
 * Ekip (CRM personeli) — saf kurallar (DeepSportAdmin features/settings/team/logic.ts'ten).
 * Sunucu aynı kuralları uygular; son aktif yönetici kuralı veritabanında da zorunlu (crm_staff_keep_admin).
 */
import { z } from "zod";
import type { PanelRole } from "@/lib/domain/auth/types";
import { normalizeEmail } from "@/lib/utils/phone";

export const PANEL_ROLES: readonly PanelRole[] = ["ADMIN", "CRM_AGENT"];

export type StaffStatus = "ACTIVE" | "DISABLED";

export interface StaffMember {
  id: string;
  email: string;
  fullName: string | null;
  role: PanelRole;
  status: StaffStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  panelRole: PanelRole;
}

/** Hesap açma yanıtı. Şifre yalnız yeni hesapta döner ve bir kez gösterilir. */
export interface StaffInviteResult {
  member: StaffMember;
  temporaryPassword: string | null;
}

export type InviteError = "emailInvalid" | "emailExists" | "nameRequired";

export function validateInvite(input: InviteInput, existing: Pick<StaffMember, "email">[]): InviteError[] {
  const errors: InviteError[] = [];
  const email = normalizeEmail(input.email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("emailInvalid");
  else if (existing.some((u) => normalizeEmail(u.email) === email)) errors.push("emailExists");
  if (!input.firstName.trim()) errors.push("nameRequired");
  return errors;
}

export type StaffChangeBlock = "self" | "lastAdmin" | "same";

/**
 * Rol ya da durum değişikliği engelleri: kendi hesabını değiştiremezsin; son aktif ADMIN'i CRM_AGENT
 * yapamaz ya da kapatamazsın (panel yöneticisiz kalır).
 */
export function staffChangeBlock(
  target: Pick<StaffMember, "id" | "role" | "status">,
  next: { role?: PanelRole; status?: StaffStatus },
  actorId: string | null | undefined,
  users: Pick<StaffMember, "id" | "role" | "status">[]
): StaffChangeBlock | null {
  const role = next.role ?? target.role;
  const status = next.status ?? target.status;
  if (role === target.role && status === target.status) return "same";
  if (actorId && target.id === actorId) return "self";
  const losesAdmin = target.role === "ADMIN" && target.status === "ACTIVE" && (role !== "ADMIN" || status !== "ACTIVE");
  if (losesAdmin) {
    const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.status === "ACTIVE");
    if (activeAdmins.length <= 1) return "lastAdmin";
  }
  return null;
}

export function displayName(u: Pick<StaffMember, "fullName" | "email">): string {
  return u.fullName?.trim() || u.email;
}

/** Sunucu gövde şemaları. */
export const inviteSchema = z.object({
  email: z.string().trim().min(1).max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
  panelRole: z.enum(["ADMIN", "CRM_AGENT"]),
});

export const staffPatchSchema = z
  .object({
    role: z.enum(["ADMIN", "CRM_AGENT"]).optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, { message: "Değişiklik yok" });
