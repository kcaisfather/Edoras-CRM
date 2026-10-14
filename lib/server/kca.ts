import "server-only";

import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { requireEnv } from "@/lib/env";
import type {
  KcaContactCreateValues,
  KcaContactDto,
  KcaContactPatchValues,
  KcaMeetingCreateValues,
  KcaMeetingDetailDto,
  KcaMeetingDto,
  KcaMeetingPatchValues,
  KcaSessionDto,
  KcaTaskCreateValues,
  KcaTaskDetailDto,
  KcaTaskDto,
  KcaTaskPatchValues,
} from "@/lib/domain/kca/types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { recordAudit } from "./audit";
import * as store from "./kca-store";
import { KcaDbError, createTursoHttpDb, type KcaDb } from "./kca-turso";

/**
 * Yönetim (KCA Panel) — sunucu bağlantısı. KCA Panel'in (kca-panel.vercel.app) Turso veritabanına YALNIZ bu dosya
 * bağlanır; kurallar kca-store.ts'te. Ortam: KCA_TURSO_DATABASE_URL + KCA_TURSO_AUTH_TOKEN (KCA Panel'in Vercel'deki
 * TURSO_DATABASE_URL / TURSO_AUTH_TOKEN değerleri), isteğe bağlı KCA_EDORAS_PROJECT_ID.
 *
 * Akış: requireStaff() → crm_kca_links'ten bağ → KCA hesabı hâlâ aktif ve şifresi aynı mı → Edoras kapsamı → KCA Panel
 * yetkileri. Her yazım CRM işlem kaydına da düşer (recordAudit; kişi adı, not metni, telefon, e-posta YAZILMAZ — network
 * ve toplantı notu KCA Panel'de kişiye özeldir, CRM'in işlem kaydını okuyan başka yönetici görmesin).
 */

let client: { url: string; token: string; db: KcaDb } | null = null;

export function isKcaConfigured(): boolean {
  return !!process.env.KCA_TURSO_DATABASE_URL?.trim();
}

function getKcaDb(): KcaDb {
  const url = requireEnv("KCA_TURSO_DATABASE_URL", process.env.KCA_TURSO_DATABASE_URL?.trim());
  const token = process.env.KCA_TURSO_AUTH_TOKEN?.trim() ?? "";
  if (!client || client.url !== url || client.token !== token) {
    client = { url, token, db: createTursoHttpDb({ url, authToken: token || null, fetch: (...args) => fetch(...args) }) };
  }
  return client.db;
}

/** KCA_EDORAS_PROJECT_ID: Edoras ana projesinin KCA kimliği (boşsa adı "Edoras" olan tek ana proje). */
function rootOverride(): number | null {
  const v = Number(process.env.KCA_EDORAS_PROJECT_ID ?? "");
  return Number.isInteger(v) && v > 0 ? v : null;
}

/** Kural ihlali ve Turso hatası → HttpError (Turso'nun yanıt gövdesi / SQL mesajı taşınmaz). */
async function kcaCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof store.KcaRuleError) throw new HttpError(err.status, err.code);
    if (err instanceof KcaDbError) throw new HttpError(502, "KCA_UNAVAILABLE", undefined, err.reason);
    throw err;
  }
}

interface LinkRow {
  kca_user_id: number;
  kca_password_fp: string;
}

async function readLink(staff: StaffContext): Promise<LinkRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_kca_links")
    .select("kca_user_id, kca_password_fp")
    .eq("staff_user_id", staff.userId)
    .maybeSingle();
  if (error) throw dbError(error);
  return (data as LinkRow | null) ?? null;
}

/** GET /api/management/session — bağ durumu ve (hazırsa) Edoras projeleri, üyeler. */
export async function kcaSession(staff: StaffContext): Promise<KcaSessionDto> {
  if (!isKcaConfigured()) return { state: "NOT_CONFIGURED" };
  const link = await readLink(staff);
  if (!link) return { state: "NOT_LINKED", reason: "NONE" };
  return kcaCall(async () => {
    const db = getKcaDb();
    const linked = await store.loadLinkedUser(db, link.kca_user_id, link.kca_password_fp);
    if (!linked.ok) return { state: "NOT_LINKED", reason: linked.reason };
    const scope = await store.loadEdorasScope(db, rootOverride());
    if (!scope) return { state: "NO_SCOPE", user: linked.user };
    const access = await store.loadAccess(db, linked.user, scope);
    const { projects, members } = await store.sessionData(db, access);
    return { state: "READY", user: linked.user, projects, members, today: access.today };
  });
}

/**
 * KCA Panel hesabını bağla: e-posta + şifre KCA Panel'de doğrulanır (hatalı denemeler KCA Panel'in giriş kilidine yazılır).
 * Aynı KCA hesabı başka bir personele bağlıysa o bağ kalkar — şifreyi bilen hesabın sahibidir.
 */
export async function linkKcaAccount(staff: StaffContext, input: { email: string; password: string }): Promise<KcaSessionDto> {
  if (!isKcaConfigured()) throw new HttpError(503, "CONFIG_MISSING", undefined, "env:KCA_TURSO_DATABASE_URL");
  const { user, fingerprint } = await kcaCall(() => store.verifyKcaLogin(getKcaDb(), input.email, input.password));
  const db = getSupabaseAdminClient();
  const freed = await db.from("crm_kca_links").delete().eq("kca_user_id", user.id).neq("staff_user_id", staff.userId);
  if (freed.error) throw dbError(freed.error);
  const { error } = await db
    .from("crm_kca_links")
    .upsert({ staff_user_id: staff.userId, kca_user_id: user.id, kca_password_fp: fingerprint, linked_at: new Date().toISOString() }, { onConflict: "staff_user_id" });
  if (error) throw dbError(error);
  await recordAudit(staff, { action: "KCA_ACCOUNT_LINKED", entityType: "kca_account", entityId: String(user.id) });
  return kcaSession(staff);
}

export async function unlinkKcaAccount(staff: StaffContext): Promise<{ ok: true }> {
  const { data, error } = await getSupabaseAdminClient().from("crm_kca_links").delete().eq("staff_user_id", staff.userId).select("kca_user_id");
  if (error) throw dbError(error);
  const removed = (data as { kca_user_id: number }[] | null)?.[0];
  if (removed) await recordAudit(staff, { action: "KCA_ACCOUNT_UNLINKED", entityType: "kca_account", entityId: String(removed.kca_user_id) });
  return { ok: true };
}

/** Uçların kapısı: bağlı, aktif KCA hesabı + Edoras kapsamı. Yoksa 409 (ekran bağlama / ayar mesajını gösterir). */
async function withKca<T>(staff: StaffContext, fn: (db: KcaDb, access: store.KcaAccess) => Promise<T>): Promise<T> {
  if (!isKcaConfigured()) throw new HttpError(503, "CONFIG_MISSING", undefined, "env:KCA_TURSO_DATABASE_URL");
  const link = await readLink(staff);
  if (!link) throw new HttpError(409, "KCA_NOT_LINKED");
  return kcaCall(async () => {
    const db = getKcaDb();
    const linked = await store.loadLinkedUser(db, link.kca_user_id, link.kca_password_fp);
    if (!linked.ok) throw new HttpError(409, "KCA_NOT_LINKED");
    const scope = await store.loadEdorasScope(db, rootOverride());
    if (!scope) throw new HttpError(409, "KCA_SCOPE_MISSING");
    return fn(db, await store.loadAccess(db, linked.user, scope));
  });
}

// ---------- görevler ----------

export const kcaListTasks = (staff: StaffContext): Promise<KcaTaskDto[]> => withKca(staff, store.listTasks);

export const kcaTaskDetail = (staff: StaffContext, taskId: number): Promise<KcaTaskDetailDto> =>
  withKca(staff, (db, a) => store.taskDetail(db, a, taskId));

export async function kcaCreateTask(staff: StaffContext, input: KcaTaskCreateValues): Promise<KcaTaskDetailDto> {
  return withKca(staff, async (db, a) => {
    const { id } = await store.createTask(db, a, input);
    await recordAudit(staff, {
      action: "KCA_TASK_CREATED",
      entityType: "kca_task",
      entityId: String(id),
      details: { projectId: input.projectId, assigned: input.assigneeId !== null, meetingId: input.meetingId },
    });
    return store.taskDetail(db, a, id);
  });
}

export async function kcaUpdateTask(staff: StaffContext, taskId: number, patch: KcaTaskPatchValues): Promise<KcaTaskDetailDto> {
  return withKca(staff, async (db, a) => {
    const { changed } = await store.updateTask(db, a, taskId, patch);
    if (changed.length) {
      await recordAudit(staff, {
        action: "KCA_TASK_UPDATED",
        entityType: "kca_task",
        entityId: String(taskId),
        details: { fields: changed.join(","), ...(patch.status && changed.includes("status") ? { status: patch.status } : {}) },
      });
    }
    return store.taskDetail(db, a, taskId);
  });
}

export async function kcaDeleteTask(staff: StaffContext, taskId: number): Promise<{ ok: true }> {
  return withKca(staff, async (db, a) => {
    const { projectId } = await store.deleteTask(db, a, taskId);
    await recordAudit(staff, { action: "KCA_TASK_DELETED", entityType: "kca_task", entityId: String(taskId), details: { projectId } });
    return { ok: true as const };
  });
}

export async function kcaAddTaskComment(staff: StaffContext, taskId: number, body: string): Promise<KcaTaskDetailDto> {
  return withKca(staff, async (db, a) => {
    await store.addTaskComment(db, a, taskId, body);
    await recordAudit(staff, { action: "KCA_TASK_COMMENTED", entityType: "kca_task", entityId: String(taskId) });
    return store.taskDetail(db, a, taskId);
  });
}

export async function kcaApproveTask(staff: StaffContext, taskId: number, note: string | null): Promise<KcaTaskDetailDto> {
  return withKca(staff, async (db, a) => {
    await store.approveTask(db, a, taskId, note);
    await recordAudit(staff, { action: "KCA_TASK_APPROVED", entityType: "kca_task", entityId: String(taskId) });
    return store.taskDetail(db, a, taskId);
  });
}

export async function kcaRequestTaskChanges(staff: StaffContext, taskId: number, note: string): Promise<KcaTaskDetailDto> {
  return withKca(staff, async (db, a) => {
    await store.requestTaskChanges(db, a, taskId, note);
    await recordAudit(staff, { action: "KCA_TASK_CHANGES_REQUESTED", entityType: "kca_task", entityId: String(taskId) });
    return store.taskDetail(db, a, taskId);
  });
}

// ---------- toplantı notları ----------

export const kcaListMeetings = (staff: StaffContext): Promise<KcaMeetingDto[]> => withKca(staff, store.listMeetings);

export const kcaMeetingDetail = (staff: StaffContext, meetingId: number): Promise<KcaMeetingDetailDto> =>
  withKca(staff, (db, a) => store.meetingDetail(db, a, meetingId));

export async function kcaCreateMeeting(staff: StaffContext, input: KcaMeetingCreateValues): Promise<KcaMeetingDetailDto> {
  return withKca(staff, async (db, a) => {
    const { id } = await store.createMeeting(db, a, input);
    await recordAudit(staff, {
      action: "KCA_MEETING_CREATED",
      entityType: "kca_meeting",
      entityId: String(id),
      details: { projectId: input.projectId, shared: input.shared, ai: input.ai },
    });
    return store.meetingDetail(db, a, id);
  });
}

export async function kcaUpdateMeeting(staff: StaffContext, meetingId: number, patch: KcaMeetingPatchValues): Promise<KcaMeetingDetailDto> {
  return withKca(staff, async (db, a) => {
    const { changed } = await store.updateMeeting(db, a, meetingId, patch);
    if (changed.length) {
      await recordAudit(staff, { action: "KCA_MEETING_UPDATED", entityType: "kca_meeting", entityId: String(meetingId), details: { fields: changed.join(",") } });
    }
    return store.meetingDetail(db, a, meetingId);
  });
}

export async function kcaDeleteMeeting(staff: StaffContext, meetingId: number): Promise<{ ok: true }> {
  return withKca(staff, async (db, a) => {
    await store.deleteMeeting(db, a, meetingId);
    await recordAudit(staff, { action: "KCA_MEETING_DELETED", entityType: "kca_meeting", entityId: String(meetingId) });
    return { ok: true as const };
  });
}

export async function kcaSetMeetingProcessed(staff: StaffContext, meetingId: number, done: boolean, result: string | null): Promise<KcaMeetingDetailDto> {
  return withKca(staff, async (db, a) => {
    await store.setMeetingProcessed(db, a, meetingId, done, result);
    await recordAudit(staff, { action: "KCA_MEETING_PROCESSED", entityType: "kca_meeting", entityId: String(meetingId), details: { done } });
    return store.meetingDetail(db, a, meetingId);
  });
}

// ---------- network ----------

export const kcaListContacts = (staff: StaffContext): Promise<KcaContactDto[]> => withKca(staff, store.listContacts);

export async function kcaCreateContact(staff: StaffContext, input: KcaContactCreateValues): Promise<KcaContactDto> {
  return withKca(staff, async (db, a) => {
    const { id } = await store.createContact(db, a, input);
    await recordAudit(staff, { action: "KCA_CONTACT_CREATED", entityType: "kca_contact", entityId: String(id), details: { projectId: input.projectId } });
    return store.getContact(db, a, id);
  });
}

export async function kcaUpdateContact(staff: StaffContext, contactId: number, patch: KcaContactPatchValues): Promise<KcaContactDto> {
  return withKca(staff, async (db, a) => {
    const { changed } = await store.updateContact(db, a, contactId, patch);
    if (changed.length) {
      await recordAudit(staff, { action: "KCA_CONTACT_UPDATED", entityType: "kca_contact", entityId: String(contactId), details: { fields: changed.join(",") } });
    }
    return store.getContact(db, a, contactId);
  });
}

export async function kcaDeleteContact(staff: StaffContext, contactId: number): Promise<{ ok: true }> {
  return withKca(staff, async (db, a) => {
    await store.deleteContact(db, a, contactId);
    await recordAudit(staff, { action: "KCA_CONTACT_DELETED", entityType: "kca_contact", entityId: String(contactId) });
    return { ok: true as const };
  });
}
