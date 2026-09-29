import "server-only";

import { randomInt } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { generateTemporaryPassword } from "@/lib/domain/institutions/rules";
import {
  displayName,
  staffChangeBlock,
  validateInvite,
  type InviteInput,
  type StaffInviteResult,
  type StaffMember,
  type StaffStatus,
} from "@/lib/domain/staff/logic";
import type { PanelRole } from "@/lib/domain/auth/types";
import { recordAudit } from "./audit";

/**
 * CRM personeli: crm_staff (rol, ad, aktif) + CRM projesinin Auth kullanıcıları (e-posta, son giriş).
 * Edoras'a dokunmaz. Yazma işlemleri yalnız ADMIN (uçlar denetler) ve işlem kaydına yazılır.
 */

interface StaffRow {
  user_id: string;
  role: PanelRole;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

async function listAuthUsers(): Promise<Map<string, User>> {
  const db = getSupabaseAdminClient();
  const users = new Map<string, User>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(502, "INTERNAL", undefined, `auth:listUsers:${error.status ?? "?"}`);
    for (const u of data.users) users.set(u.id, u);
    if (data.users.length < 1000) return users;
  }
}

function toMember(row: StaffRow, user: User | undefined): StaffMember {
  return {
    id: row.user_id,
    email: user?.email ?? "",
    fullName: row.full_name,
    role: row.role,
    status: row.is_active ? "ACTIVE" : "DISABLED",
    lastLoginAt: user?.last_sign_in_at ?? null,
    createdAt: row.created_at,
  };
}

export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_staff")
    .select("user_id, role, full_name, is_active, created_at")
    .order("created_at");
  if (error) throw dbError(error);
  const users = await listAuthUsers();
  return ((data ?? []) as StaffRow[]).map((row) => toMember(row, users.get(row.user_id)));
}

/**
 * CRM hesabı açar (ya da bu projede zaten var olan Auth kullanıcısını ekibe ekler). Yeni hesapta geçici
 * şifre döner ve bir kez gösterilir — e-posta gönderimi kurulu değil.
 */
export async function inviteStaff(input: InviteInput, actor: StaffContext): Promise<StaffInviteResult> {
  const current = await listStaff();
  const errors = validateInvite(input, current);
  if (errors.includes("emailExists")) throw new HttpError(409, "STAFF_EXISTS");
  if (errors.length) throw new HttpError(400, "VALIDATION");

  const db = getSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();
  const fullName = [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(" ");

  const users = await listAuthUsers();
  let user = [...users.values()].find((u) => u.email?.toLowerCase() === email);
  let temporaryPassword: string | null = null;
  if (!user) {
    temporaryPassword = generateTemporaryPassword((max) => randomInt(max));
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new HttpError(502, "INTERNAL", undefined, `auth:createUser:${error?.status ?? "?"}`);
    user = data.user;
  }

  const { data: row, error } = await db
    .from("crm_staff")
    .insert({ user_id: user.id, role: input.panelRole, full_name: fullName, is_active: true, created_by: actor.userId })
    .select("user_id, role, full_name, is_active, created_at")
    .single();
  if (error) {
    // Hesabı biz açtıysak ekip kaydı yazılamadığında geri al (yarım hesap kalmasın).
    if (temporaryPassword) await db.auth.admin.deleteUser(user.id);
    throw dbError(error);
  }

  const member = toMember(row as StaffRow, user);
  await recordAudit(actor, {
    action: "STAFF_CREATED",
    entityType: "staff",
    entityId: member.id,
    entityLabel: displayName(member),
    details: { role: member.role },
  });
  return { member, temporaryPassword };
}

export async function updateStaff(
  id: string,
  patch: { role?: PanelRole; status?: StaffStatus },
  actor: StaffContext
): Promise<StaffMember> {
  const current = await listStaff();
  const target = current.find((m) => m.id === id);
  if (!target) throw new HttpError(404, "NOT_FOUND");
  const block = staffChangeBlock(target, patch, actor.userId, current);
  if (block === "self") throw new HttpError(403, "SELF_CHANGE");
  if (block === "lastAdmin") throw new HttpError(409, "LAST_ADMIN");
  if (block === "same") return target;

  const update: Record<string, unknown> = {};
  if (patch.role) update.role = patch.role;
  if (patch.status) update.is_active = patch.status === "ACTIVE";
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_staff")
    .update(update)
    .eq("user_id", id)
    .select("user_id, role, full_name, is_active, created_at")
    .single();
  if (error) throw dbError(error); // CRM_LAST_ADMIN → 409 LAST_ADMIN (eşzamanlı değişiklik)

  const next = toMember(data as StaffRow, undefined);
  const label = displayName(target);
  if (patch.role && patch.role !== target.role) {
    await recordAudit(actor, {
      action: "STAFF_ROLE_CHANGED",
      entityType: "staff",
      entityId: id,
      entityLabel: label,
      details: { from: target.role, to: patch.role },
    });
  }
  if (patch.status && patch.status !== target.status) {
    await recordAudit(actor, {
      action: patch.status === "ACTIVE" ? "STAFF_ENABLED" : "STAFF_DISABLED",
      entityType: "staff",
      entityId: id,
      entityLabel: label,
    });
  }
  return { ...next, email: target.email, lastLoginAt: target.lastLoginAt };
}

/** Yeni geçici şifre üretir (eski şifre geçersiz olur). Kendi şifresi Hesabım'dan değiştirilir. */
export async function resetStaffPassword(id: string, actor: StaffContext): Promise<{ temporaryPassword: string }> {
  if (id === actor.userId) throw new HttpError(403, "SELF_CHANGE");
  const current = await listStaff();
  const target = current.find((m) => m.id === id);
  if (!target) throw new HttpError(404, "NOT_FOUND");
  const temporaryPassword = generateTemporaryPassword((max) => randomInt(max));
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(id, { password: temporaryPassword });
  if (error) throw new HttpError(502, "INTERNAL", undefined, `auth:updateUser:${error.status ?? "?"}`);
  await recordAudit(actor, { action: "STAFF_PASSWORD_RESET", entityType: "staff", entityId: id, entityLabel: displayName(target) });
  return { temporaryPassword };
}
