/**
 * Yönetim (KCA Panel) veri katmanı — KCA Panel'in Turso tablolarını (users, projects, project_members, tasks,
 * task_comments, task_events, task_stars, meetings, contacts, login_attempts) okur ve yazar. Şema KCA Panel'indir
 * (kcaisfather/KCAPanel lib/schema.js) ve buradan DEĞİŞTİRİLMEZ; yazımlar KCA Panel'in kendi işlemleriyle (lib/actions.js)
 * aynı satırları ve geçmiş kayıtlarını üretir, böylece iki panel aynı veriyi işler.
 *
 * İki kat kural (ikisi de burada, sunucuda):
 *   1. Edoras kapsamı: yalnız kökü "Edoras" ana projesi olan projeler (Edoras + alt projeleri). Kapsam dışındaki görev,
 *      toplantı notu ve network kaydı hiçbir uçtan görünmez ve yazılamaz (bulunamadı = 404; varlığı da sızdırılmaz).
 *      Projesi olmayan toplantı / kişi Edoras etiketi taşımaz → görünmez.
 *   2. KCA Panel yetkisi (bağlı KCA hesabı adına): yönetici tüm projeleri görür, diğerleri üyesi olduklarını; görev girme /
 *      son tarih yetkisi proje üyeliğinden; toplantı notu sahibine aittir (paylaşılmışsa proje ekibi okur); network
 *      kişiye özeldir — yönetici dahil kimse başkasınınkini göremez.
 *
 * `server-only` içermez (testler bellek içi SQLite ile çalıştırır); bağlantı ve oturum lib/server/kca.ts'te.
 */
import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import type { ApiErrorCode } from "@/lib/api/error-codes";
import { todayIso } from "@/lib/domain/institutions/rules";
import { isEdorasRootName, meetingFirstLine, parseMeetingText, stripMeetingCode } from "@/lib/domain/kca/rules";
import type {
  KcaContactCreateValues,
  KcaContactDto,
  KcaContactPatchValues,
  KcaContactStatus,
  KcaMeetingCreateValues,
  KcaMeetingDetailDto,
  KcaMeetingDto,
  KcaMeetingPatchValues,
  KcaMeetingStatus,
  KcaMemberDto,
  KcaPriority,
  KcaProjectDto,
  KcaTaskCreateValues,
  KcaTaskDetailDto,
  KcaTaskDto,
  KcaTaskPatchValues,
  KcaTaskStatus,
  KcaUserDto,
} from "@/lib/domain/kca/types";
import { KCA_LIMITS } from "@/lib/domain/kca/types";
import type { KcaArg, KcaDb, KcaRow, KcaStatement } from "./kca-turso";

/** Kural ihlali → uçta HttpError(status, code). */
export class KcaRuleError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode
  ) {
    super(code);
    this.name = "KcaRuleError";
  }
}

const fail = (status: number, code: ApiErrorCode): never => {
  throw new KcaRuleError(status, code);
};

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const flag = (v: unknown): boolean => Number(v) === 1;
/** `x IN (...)`; boş listede hiçbir satırla eşleşmeyen `(NULL)`. */
const inList = (ids: readonly number[]): string => (ids.length ? `(${ids.map(() => "?").join(", ")})` : "(NULL)");

async function q(db: KcaDb, sql: string, args: KcaArg[] = []): Promise<KcaRow[]> {
  return (await db.execute(sql, args)).rows;
}
async function one(db: KcaDb, sql: string, args: KcaArg[] = []): Promise<KcaRow | null> {
  return (await q(db, sql, args))[0] ?? null;
}

/** SQLite `datetime('now')` biçimi (UTC). */
function nowUtc(now: Date = new Date()): string {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

// ---------- kullanıcı ve hesap bağlama ----------

export type KcaUser = KcaUserDto;

function userOf(row: KcaRow): KcaUser {
  return { id: num(row.id), name: String(row.name), email: String(row.email), isAdmin: flag(row.is_admin) };
}

/**
 * Bağın parmak izi: KCA Panel'deki şifre özetinin SHA-256'sı. Şifre değişince (kişi ya da yönetici sıfırlayınca) özet
 * değişir ve CRM'deki bağ kendiliğinden düşer — KCA Panel'in "şifre değişince oturumlar kapanır" kuralının karşılığı.
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex");
}

/** KCA Panel lib/auth.js verifyPassword ile aynı: "scrypt$<tuz b64>$<anahtar b64>", N=16384 r=8 p=1. */
export function verifyKcaPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, keyB64] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return Promise.resolve(false);
  const key = Buffer.from(keyB64, "base64");
  if (!key.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    scrypt(password, Buffer.from(saltB64, "base64"), key.length, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      resolve(!err && derived.length === key.length && timingSafeEqual(key, derived));
    });
  });
}

/** KCA Panel'in giriş kilidi (lib/auth.js): 15 dakikada 8 hatalı deneme → o e-posta kilitli. Aynı tablo kullanılır. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;

/**
 * Hesap bağlama: e-posta + KCA Panel şifresi. Yalnız aktif, insan (AI ekip değil) hesap bağlanır. Hatalı denemeler KCA
 * Panel'in kendi giriş kilidine yazılır — CRM üzerinden şifre denemesi KCA Panel girişinden daha gevşek olamaz.
 */
export async function verifyKcaLogin(
  db: KcaDb,
  emailInput: string,
  password: string,
  now: number = Date.now()
): Promise<{ user: KcaUser; fingerprint: string }> {
  const email = emailInput.trim().toLowerCase();
  const attempts = await one(db, "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND at > ?", [email, now - LOGIN_WINDOW_MS]);
  if (attempts && num(attempts.n) >= LOGIN_MAX_FAILS) fail(429, "KCA_LOGIN_LOCKED");
  const row = await one(db, "SELECT id, name, email, password_hash, is_admin, active, is_agent FROM users WHERE email = ?", [email]);
  const valid = !!row && flag(row.active) && !flag(row.is_agent) && (await verifyKcaPassword(password, String(row.password_hash ?? "")));
  if (!row || !valid) {
    await db.execute("INSERT INTO login_attempts (email, at) VALUES (?, ?)", [email, now]);
    return fail(400, "KCA_LOGIN_FAILED");
  }
  await db.execute("DELETE FROM login_attempts WHERE email = ? OR at < ?", [email, now - LOGIN_WINDOW_MS]);
  return { user: userOf(row), fingerprint: passwordFingerprint(String(row.password_hash)) };
}

export type LinkedUserResult = { ok: true; user: KcaUser } | { ok: false; reason: "PASSWORD_CHANGED" | "INACTIVE" };

/** Her istekte: bağlı KCA hesabı hâlâ aktif mi, şifresi bağlandığından beri değişmedi mi. */
export async function loadLinkedUser(db: KcaDb, kcaUserId: number, fingerprint: string): Promise<LinkedUserResult> {
  const row = await one(db, "SELECT id, name, email, password_hash, is_admin, active, is_agent FROM users WHERE id = ?", [kcaUserId]);
  if (!row || !flag(row.active) || flag(row.is_agent)) return { ok: false, reason: "INACTIVE" };
  if (passwordFingerprint(String(row.password_hash ?? "")) !== fingerprint) return { ok: false, reason: "PASSWORD_CHANGED" };
  return { ok: true, user: userOf(row) };
}

// ---------- Edoras kapsamı ve erişim ----------

export interface KcaScopeProject {
  id: number;
  name: string;
  color: string;
  parentId: number | null;
  archived: boolean;
}

export interface EdorasScope {
  rootId: number;
  projects: KcaScopeProject[];
  ids: number[];
}

function scopeProjectOf(row: KcaRow): KcaScopeProject {
  return {
    id: num(row.id),
    name: String(row.name),
    color: String(row.color ?? "#3b6fd8"),
    parentId: numOrNull(row.parent_id),
    archived: flag(row.archived),
  };
}

/**
 * Edoras kapsamı: kök = `rootIdOverride` (KCA_EDORAS_PROJECT_ID) ya da adı "Edoras" olan TEK ana proje; + kökün alt
 * projeleri (KCA Panel projeleri iki katmanlıdır). Kök bulunamazsa ya da adı tutan birden çok ana proje varsa null —
 * yanlış projeyi göstermektense hiçbir şey gösterilmez.
 */
export async function loadEdorasScope(db: KcaDb, rootIdOverride?: number | null): Promise<EdorasScope | null> {
  let rootId: number | null = null;
  if (rootIdOverride) {
    const root = await one(db, "SELECT id FROM projects WHERE id = ? AND parent_id IS NULL", [rootIdOverride]);
    rootId = root ? num(root.id) : null;
  } else {
    const tops = (await q(db, "SELECT id, name FROM projects WHERE parent_id IS NULL")).filter((p) => isEdorasRootName(String(p.name)));
    rootId = tops.length === 1 ? num(tops[0].id) : null;
  }
  if (!rootId) return null;
  const projects = (
    await q(db, "SELECT id, name, color, parent_id, archived FROM projects WHERE id = ? OR parent_id = ? ORDER BY parent_id IS NOT NULL, name", [
      rootId,
      rootId,
    ])
  ).map(scopeProjectOf);
  return { rootId, projects, ids: projects.map((p) => p.id) };
}

export interface KcaProjectAccess extends KcaScopeProject {
  canCreateTasks: boolean;
  canEditDueDates: boolean;
}

/** Bağlı kişinin Edoras kapsamında gördüğü projeler ve yetkileri. */
export interface KcaAccess {
  me: KcaUser;
  scope: EdorasScope;
  projects: Map<number, KcaProjectAccess>;
  /** Kişinin gördüğü Edoras projeleri (yönetici: hepsi). */
  visibleIds: number[];
  today: string;
}

export async function loadAccess(db: KcaDb, me: KcaUser, scope: EdorasScope, today: string = todayIso()): Promise<KcaAccess> {
  const projects = new Map<number, KcaProjectAccess>();
  if (me.isAdmin) {
    for (const p of scope.projects) projects.set(p.id, { ...p, canCreateTasks: true, canEditDueDates: true });
  } else {
    const rows = await q(
      db,
      `SELECT project_id, can_create_tasks, can_edit_due_dates FROM project_members WHERE user_id = ? AND project_id IN ${inList(scope.ids)}`,
      [me.id, ...scope.ids]
    );
    const byId = new Map(scope.projects.map((p) => [p.id, p]));
    for (const r of rows) {
      const p = byId.get(num(r.project_id));
      if (p) projects.set(p.id, { ...p, canCreateTasks: flag(r.can_create_tasks), canEditDueDates: flag(r.can_edit_due_dates) });
    }
  }
  const visibleIds = scope.projects.filter((p) => projects.has(p.id)).map((p) => p.id);
  return { me, scope, projects, visibleIds, today };
}

function projectFor(access: KcaAccess, projectId: number): KcaProjectAccess {
  const p = access.projects.get(projectId);
  // Kapsam dışı ya da üyesi olunmayan proje: varlığı sızdırılmaz.
  if (!p) return fail(404, "NOT_FOUND");
  return p;
}

export async function sessionData(db: KcaDb, access: KcaAccess): Promise<{ projects: KcaProjectDto[]; members: KcaMemberDto[] }> {
  const projects: KcaProjectDto[] = access.visibleIds.map((id) => {
    const p = access.projects.get(id)!;
    return { id: p.id, name: p.name, color: p.color, parentId: p.parentId, archived: p.archived, canCreateTasks: p.canCreateTasks, canEditDueDates: p.canEditDueDates };
  });
  const rows = await q(
    db,
    `SELECT m.project_id, u.id, u.name, u.active FROM project_members m JOIN users u ON u.id = m.user_id
     WHERE m.project_id IN ${inList(access.visibleIds)} ORDER BY u.name`,
    [...access.visibleIds]
  );
  const members = rows.map((r) => ({ projectId: num(r.project_id), id: num(r.id), name: String(r.name), active: flag(r.active) }));
  return { projects, members };
}

// ---------- görevler ----------

const TASK_SELECT = `SELECT t.id, t.project_id, t.subject, t.title, t.description, t.assignee_id, t.status, t.priority, t.due_date,
    t.meeting_id, t.created_by, t.created_at, t.updated_at, t.completed_at,
    p.name AS project_name, p.color AS project_color, u.name AS assignee_name,
    (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count
  FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id`;

function taskOf(r: KcaRow): KcaTaskDto {
  return {
    id: num(r.id),
    projectId: num(r.project_id),
    projectName: String(r.project_name ?? ""),
    projectColor: String(r.project_color ?? "#3b6fd8"),
    subject: strOrNull(r.subject),
    title: String(r.title),
    description: strOrNull(r.description),
    assigneeId: numOrNull(r.assignee_id),
    assigneeName: strOrNull(r.assignee_name),
    status: String(r.status) as KcaTaskStatus,
    priority: String(r.priority) as KcaPriority,
    dueDate: strOrNull(r.due_date),
    meetingId: numOrNull(r.meeting_id),
    createdById: numOrNull(r.created_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    completedAt: strOrNull(r.completed_at),
    commentCount: num(r.comment_count ?? 0),
  };
}

/** Kişinin gördüğü Edoras projelerindeki tüm görevler (KCA Panel taskList'in Edoras süzgeçli hâli). */
export async function listTasks(db: KcaDb, access: KcaAccess): Promise<KcaTaskDto[]> {
  const rows = await q(
    db,
    `${TASK_SELECT} WHERE t.project_id IN ${inList(access.visibleIds)} ORDER BY t.due_date IS NULL, t.due_date, t.id`,
    [...access.visibleIds]
  );
  return rows.map(taskOf);
}

interface TaskRow {
  id: number;
  project_id: number;
  title: string;
  subject: string | null;
  description: string | null;
  assignee_id: number | null;
  status: string;
  priority: string;
  due_date: string | null;
}

async function loadTask(db: KcaDb, access: KcaAccess, taskId: number): Promise<{ task: TaskRow; project: KcaProjectAccess }> {
  const row = await one(db, "SELECT id, project_id, title, subject, description, assignee_id, status, priority, due_date FROM tasks WHERE id = ?", [taskId]);
  if (!row) return fail(404, "NOT_FOUND");
  const task: TaskRow = {
    id: num(row.id),
    project_id: num(row.project_id),
    title: String(row.title),
    subject: strOrNull(row.subject),
    description: strOrNull(row.description),
    assignee_id: numOrNull(row.assignee_id),
    status: String(row.status),
    priority: String(row.priority),
    due_date: strOrNull(row.due_date),
  };
  return { task, project: projectFor(access, task.project_id) };
}

function logEvent(taskId: number, userId: number, kind: string, oldV: unknown, newV: unknown): KcaStatement {
  return {
    sql: "INSERT INTO task_events (task_id, user_id, kind, old_value, new_value) VALUES (?, ?, ?, ?, ?)",
    args: [taskId, userId, kind, oldV === null || oldV === undefined ? null : String(oldV), newV === null || newV === undefined ? null : String(newV)],
  };
}

async function isMember(db: KcaDb, projectId: number, userId: number): Promise<boolean> {
  return !!(await one(db, "SELECT 1 AS x FROM project_members WHERE project_id = ? AND user_id = ?", [projectId, userId]));
}

async function assertAssignable(db: KcaDb, projectId: number, assigneeId: number | null): Promise<void> {
  if (assigneeId === null) return;
  if (!(await isMember(db, projectId, assigneeId))) fail(400, "KCA_ASSIGNEE_INVALID");
}

export async function getTask(db: KcaDb, access: KcaAccess, taskId: number): Promise<KcaTaskDto> {
  await loadTask(db, access, taskId);
  const row = await one(db, `${TASK_SELECT} WHERE t.id = ?`, [taskId]);
  if (!row) return fail(404, "NOT_FOUND");
  return taskOf(row);
}

export async function taskDetail(db: KcaDb, access: KcaAccess, taskId: number): Promise<KcaTaskDetailDto> {
  const { task, project } = await loadTask(db, access, taskId);
  const [full, creator, comments, events, members] = await db.batch([
    { sql: `${TASK_SELECT} WHERE t.id = ?`, args: [taskId] },
    { sql: "SELECT u.name FROM tasks t JOIN users u ON u.id = t.created_by WHERE t.id = ?", args: [taskId] },
    {
      sql: `SELECT c.id, c.body, c.created_at, u.name AS user_name FROM task_comments c LEFT JOIN users u ON u.id = c.user_id
            WHERE c.task_id = ? ORDER BY c.id`,
      args: [taskId],
    },
    {
      sql: `SELECT e.kind, e.old_value, e.new_value, e.created_at, u.name AS user_name FROM task_events e LEFT JOIN users u ON u.id = e.user_id
            WHERE e.task_id = ? ORDER BY e.id`,
      args: [taskId],
    },
    {
      sql: "SELECT u.id, u.name FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? AND u.active = 1 ORDER BY u.name",
      args: [task.project_id],
    },
  ]);
  if (!full.rows[0]) return fail(404, "NOT_FOUND");

  // Sorumlu geçmişi kimlik saklar (KCA Panel); ekrana ad gider.
  const ids = new Set<number>();
  for (const e of events.rows) {
    if (e.kind !== "assignee") continue;
    for (const v of [e.old_value, e.new_value]) if (v !== null && /^\d+$/.test(String(v))) ids.add(Number(v));
  }
  const names = new Map<number, string>();
  if (ids.size) {
    const list = [...ids];
    for (const r of await q(db, `SELECT id, name FROM users WHERE id IN ${inList(list)}`, list)) names.set(num(r.id), String(r.name));
  }
  const nameOf = (v: unknown) => (v === null || v === undefined ? null : (names.get(Number(v)) ?? String(v)));

  return {
    task: { ...taskOf(full.rows[0]), createdByName: strOrNull(creator.rows[0]?.name) },
    perms: { canCreateTasks: project.canCreateTasks, canEditDueDates: project.canEditDueDates, isAssignee: task.assignee_id === access.me.id },
    comments: comments.rows.map((c) => ({ id: num(c.id), body: String(c.body), createdAt: String(c.created_at), userName: strOrNull(c.user_name) })),
    events: events.rows.map((e) => ({
      kind: String(e.kind),
      oldValue: e.kind === "assignee" ? nameOf(e.old_value) : strOrNull(e.old_value),
      newValue: e.kind === "assignee" ? nameOf(e.new_value) : strOrNull(e.new_value),
      createdAt: String(e.created_at),
      userName: strOrNull(e.user_name),
    })),
    members: members.rows.map((m) => ({ id: num(m.id), name: String(m.name) })),
  };
}

export async function createTask(db: KcaDb, access: KcaAccess, input: KcaTaskCreateValues): Promise<{ id: number }> {
  const project = projectFor(access, input.projectId);
  if (!project.canCreateTasks) fail(403, "KCA_FORBIDDEN");
  await assertAssignable(db, project.id, input.assigneeId);
  if (input.meetingId !== null) await loadMeeting(db, access, input.meetingId);
  const rows = await q(
    db,
    `INSERT INTO tasks (project_id, subject, title, description, assignee_id, priority, due_date, meeting_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [project.id, input.subject, input.title, input.description, input.assigneeId, input.priority, input.dueDate, input.meetingId, access.me.id]
  );
  const id = num(rows[0].id);
  await db.batch([logEvent(id, access.me.id, "created", null, input.title)]);
  return { id };
}

/**
 * KCA Panel updateTask + moveTasks: bilgi alanları (başlık, konu, not, öncelik, sorumlu) görev girme yetkisi ister; son
 * tarih ayrı yetki; durumu görev girme yetkisi olan ya da görevin sorumlusu değiştirir. Taşıma yalnız Edoras projeleri
 * arasında ve iki projede de görev girme yetkisiyle; sorumlu hedef projede üye değilse görev atanmamış olur.
 * Döner: değişen alan adları (işlem kaydı için; değerler yazılmaz).
 */
export async function updateTask(db: KcaDb, access: KcaAccess, taskId: number, patch: KcaTaskPatchValues): Promise<{ changed: string[] }> {
  const { task, project } = await loadTask(db, access, taskId);
  const me = access.me;
  const sets: string[] = [];
  const args: KcaArg[] = [];
  const events: KcaStatement[] = [];
  const changed: string[] = [];
  const isAssignee = task.assignee_id === me.id;

  let targetProject = project;
  if (patch.projectId !== undefined && patch.projectId !== task.project_id) {
    targetProject = projectFor(access, patch.projectId);
    if (!project.canCreateTasks || !targetProject.canCreateTasks) fail(403, "KCA_FORBIDDEN");
    sets.push("project_id = ?");
    args.push(targetProject.id);
    events.push(logEvent(taskId, me.id, "project", project.name, targetProject.name));
    changed.push("projectId");
  }

  const set = (column: string, value: KcaArg, key: string) => {
    sets.push(`${column} = ?`);
    args.push(value);
    changed.push(key);
  };
  if (patch.title !== undefined && patch.title !== task.title) set("title", patch.title, "title");
  if (patch.subject !== undefined && patch.subject !== task.subject) set("subject", patch.subject, "subject");
  if (patch.description !== undefined && patch.description !== task.description) set("description", patch.description, "description");
  if (patch.priority !== undefined && patch.priority !== task.priority) set("priority", patch.priority, "priority");

  let assignee = patch.assigneeId !== undefined ? patch.assigneeId : task.assignee_id;
  if (patch.assigneeId !== undefined) await assertAssignable(db, targetProject.id, assignee);
  else if (targetProject !== project && assignee !== null && !(await isMember(db, targetProject.id, assignee))) assignee = null;
  if (assignee !== task.assignee_id) {
    set("assignee_id", assignee, "assigneeId");
    events.push(logEvent(taskId, me.id, "assignee", task.assignee_id, assignee));
  }
  // Bilgi alanı değişikliği görev girme yetkisi ister (taşımada sorumlunun kendiliğinden düşmesi hariç: taşıma yetkisi yeter).
  const detailChanged = changed.some((k) => ["title", "subject", "description", "priority"].includes(k)) || (patch.assigneeId !== undefined && changed.includes("assigneeId"));
  if (detailChanged && !project.canCreateTasks) fail(403, "KCA_FORBIDDEN");

  if (patch.dueDate !== undefined && patch.dueDate !== task.due_date) {
    if (!project.canEditDueDates) fail(403, "KCA_FORBIDDEN");
    set("due_date", patch.dueDate, "dueDate");
    events.push(logEvent(taskId, me.id, "due_date", task.due_date, patch.dueDate));
  }

  if (patch.status !== undefined && patch.status !== task.status) {
    if (!project.canCreateTasks && !isAssignee) fail(403, "KCA_FORBIDDEN");
    set("status", patch.status, "status");
    sets.push(patch.status === "done" ? "completed_at = datetime('now')" : "completed_at = NULL");
    events.push(logEvent(taskId, me.id, "status", task.status, patch.status));
  }

  if (!sets.length) return { changed: [] };
  sets.push("updated_at = datetime('now')");
  await db.batch([{ sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, args: [...args, taskId] }, ...events]);
  return { changed };
}

export async function deleteTask(db: KcaDb, access: KcaAccess, taskId: number): Promise<{ projectId: number }> {
  const { task, project } = await loadTask(db, access, taskId);
  if (!project.canCreateTasks) fail(403, "KCA_FORBIDDEN");
  await db.batch([
    { sql: "DELETE FROM task_comments WHERE task_id = ?", args: [taskId] },
    { sql: "DELETE FROM task_events WHERE task_id = ?", args: [taskId] },
    { sql: "DELETE FROM task_stars WHERE task_id = ?", args: [taskId] },
    { sql: "DELETE FROM tasks WHERE id = ?", args: [taskId] },
  ]);
  return { projectId: task.project_id };
}

export async function addTaskComment(db: KcaDb, access: KcaAccess, taskId: number, body: string): Promise<void> {
  await loadTask(db, access, taskId);
  await db.batch([
    { sql: "INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)", args: [taskId, access.me.id, body] },
    { sql: "UPDATE tasks SET updated_at = datetime('now') WHERE id = ?", args: [taskId] },
  ]);
}

/** "✓ OK": Onay bekliyor → Tamamlandı (KCA Panel approveTask). Onayı insan verir; AI ekip hesabı zaten bağlanamaz. */
export async function approveTask(db: KcaDb, access: KcaAccess, taskId: number, note: string | null): Promise<void> {
  const { task, project } = await loadTask(db, access, taskId);
  if (!project.canCreateTasks) fail(403, "KCA_FORBIDDEN");
  if (task.status !== "review") fail(400, "KCA_TASK_NOT_REVIEW");
  const stmts: KcaStatement[] = [
    { sql: "UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", args: [taskId] },
    logEvent(taskId, access.me.id, "approved", "review", "done"),
  ];
  if (note) stmts.push({ sql: "INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)", args: [taskId, access.me.id, note] });
  await db.batch(stmts);
}

/** "Düzeltme iste": Onay bekliyor → Devam ediyor + not (KCA Panel requestChanges). */
export async function requestTaskChanges(db: KcaDb, access: KcaAccess, taskId: number, note: string): Promise<void> {
  const { task, project } = await loadTask(db, access, taskId);
  if (!project.canCreateTasks) fail(403, "KCA_FORBIDDEN");
  if (task.status !== "review") fail(400, "KCA_TASK_NOT_REVIEW");
  await db.batch([
    { sql: "UPDATE tasks SET status = 'doing', completed_at = NULL, updated_at = datetime('now') WHERE id = ?", args: [taskId] },
    logEvent(taskId, access.me.id, "changes_requested", "review", "doing"),
    { sql: "INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)", args: [taskId, access.me.id, `Düzeltme istendi: ${note}`] },
  ]);
}

// ---------- toplantılar ----------

const MEETING_SELECT = `SELECT m.id, m.owner_id, m.project_id, m.title, m.meeting_date, m.participants, m.body, m.status, m.shared, m.ai,
    m.source, m.processed_at, m.result, m.created_at, m.updated_at,
    p.name AS project_name, p.color AS project_color, u.name AS owner_name, pb.name AS processed_by_name`;
const MEETING_FROM = `FROM meetings m JOIN projects p ON p.id = m.project_id LEFT JOIN users u ON u.id = m.owner_id
  LEFT JOIN users pb ON pb.id = m.processed_by`;

function meetingOf(r: KcaRow, meId: number): KcaMeetingDto {
  return {
    id: num(r.id),
    ownerId: num(r.owner_id),
    ownerName: strOrNull(r.owner_name),
    isOwner: num(r.owner_id) === meId,
    projectId: num(r.project_id),
    projectName: String(r.project_name ?? ""),
    projectColor: String(r.project_color ?? "#3b6fd8"),
    title: String(r.title),
    meetingDate: String(r.meeting_date),
    participants: strOrNull(r.participants),
    body: String(r.body),
    status: String(r.status) as KcaMeetingStatus,
    shared: flag(r.shared),
    ai: flag(r.ai),
    source: strOrNull(r.source),
    processedAt: strOrNull(r.processed_at),
    processedByName: strOrNull(r.processed_by_name),
    result: strOrNull(r.result),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    taskCount: num(r.task_count ?? 0),
  };
}

/**
 * Görünürlük (KCA Panel meetings + Edoras süzgeci): projesi Edoras kapsamında VE (sahibi ben YA DA paylaşılmış ve projeyi
 * görüyorum). Projesiz toplantı Edoras etiketi taşımaz.
 */
function meetingWhere(access: KcaAccess): { sql: string; args: KcaArg[] } {
  return {
    sql: `m.project_id IN ${inList(access.scope.ids)} AND (m.owner_id = ? OR (m.shared = 1 AND m.project_id IN ${inList(access.visibleIds)}))`,
    args: [...access.scope.ids, access.me.id, ...access.visibleIds],
  };
}

const taskCountSql = (access: KcaAccess) =>
  `(SELECT COUNT(*) FROM tasks t WHERE t.meeting_id = m.id AND t.project_id IN ${inList(access.visibleIds)}) AS task_count`;

export async function listMeetings(db: KcaDb, access: KcaAccess): Promise<KcaMeetingDto[]> {
  const where = meetingWhere(access);
  const rows = await q(
    db,
    `${MEETING_SELECT}, ${taskCountSql(access)} ${MEETING_FROM} WHERE ${where.sql} ORDER BY m.meeting_date DESC, m.id DESC`,
    [...access.visibleIds, ...where.args]
  );
  return rows.map((r) => meetingOf(r, access.me.id));
}

async function loadMeeting(db: KcaDb, access: KcaAccess, meetingId: number): Promise<KcaMeetingDto> {
  const where = meetingWhere(access);
  const row = await one(db, `${MEETING_SELECT}, ${taskCountSql(access)} ${MEETING_FROM} WHERE m.id = ? AND ${where.sql}`, [
    ...access.visibleIds,
    meetingId,
    ...where.args,
  ]);
  if (!row) return fail(404, "NOT_FOUND");
  return meetingOf(row, access.me.id);
}

export async function meetingDetail(db: KcaDb, access: KcaAccess, meetingId: number): Promise<KcaMeetingDetailDto> {
  const meeting = await loadMeeting(db, access, meetingId);
  const tasks = await q(db, `${TASK_SELECT} WHERE t.meeting_id = ? AND t.project_id IN ${inList(access.visibleIds)} ORDER BY t.id`, [
    meetingId,
    ...access.visibleIds,
  ]);
  return { meeting, tasks: tasks.map(taskOf) };
}

async function loadOwnMeeting(db: KcaDb, access: KcaAccess, meetingId: number): Promise<KcaMeetingDto> {
  const meeting = await loadMeeting(db, access, meetingId);
  if (!meeting.isOwner) fail(403, "KCA_NOT_OWNER");
  return meeting;
}

/**
 * Yeni toplantı notu (sahibi oturumdaki kişi; KCA Panel createMeeting). Konu / tarih / katılanlar verilmezse notun
 * "Konu:", "Tarih:", "Katılanlar:" satırlarından okunur; tarih bugünden sonraysa "Planlanan". Firma (proje) zorunlu ve
 * Edoras projelerinden biri — CRM'de projesiz not açılmaz (açılsa görünmezdi).
 */
export async function createMeeting(db: KcaDb, access: KcaAccess, input: KcaMeetingCreateValues): Promise<{ id: number }> {
  const project = projectFor(access, input.projectId);
  const body = stripMeetingCode(input.body).trim();
  if (!body) fail(400, "VALIDATION");
  const parsed = parseMeetingText(body, access.today);
  const title = (input.title || parsed.title || meetingFirstLine(body) || "Toplantı").slice(0, KCA_LIMITS.meetingTitle);
  const date = input.date || parsed.date || access.today;
  const participants = (input.participants ?? parsed.participants ?? null)?.slice(0, KCA_LIMITS.meetingParticipants) || null;
  const status: KcaMeetingStatus = input.status ?? (date > access.today ? "planned" : "held");
  const rows = await q(
    db,
    `INSERT INTO meetings (owner_id, project_id, title, meeting_date, participants, body, status, shared, ai, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'crm') RETURNING id`,
    [access.me.id, project.id, title, date, participants, body, status, input.shared, input.ai]
  );
  return { id: num(rows[0].id) };
}

/** Yalnız sahibi düzenler; firma yalnız Edoras projeleri arasında değişir. Döner: değişen alan adları. */
export async function updateMeeting(db: KcaDb, access: KcaAccess, meetingId: number, patch: KcaMeetingPatchValues): Promise<{ changed: string[] }> {
  await loadOwnMeeting(db, access, meetingId);
  const cols: [string, KcaArg, string][] = [];
  if (patch.title !== undefined) cols.push(["title", patch.title, "title"]);
  if (patch.date !== undefined) cols.push(["meeting_date", patch.date, "date"]);
  if (patch.participants !== undefined) cols.push(["participants", patch.participants, "participants"]);
  if (patch.body !== undefined) {
    const body = stripMeetingCode(patch.body).trim();
    if (!body) fail(400, "VALIDATION");
    cols.push(["body", body, "body"]);
  }
  if (patch.status !== undefined) cols.push(["status", patch.status, "status"]);
  if (patch.projectId !== undefined) cols.push(["project_id", projectFor(access, patch.projectId).id, "projectId"]);
  if (patch.shared !== undefined) cols.push(["shared", patch.shared, "shared"]);
  if (patch.ai !== undefined) cols.push(["ai", patch.ai, "ai"]);
  if (!cols.length) return { changed: [] };
  await db.execute(`UPDATE meetings SET ${cols.map(([c]) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`, [
    ...cols.map(([, v]) => v),
    meetingId,
  ]);
  return { changed: cols.map(([, , k]) => k) };
}

/** Yalnız sahibi siler; toplantıdan çıkan görevler kalır, bağları kopar (KCA Panel deleteMeeting). */
export async function deleteMeeting(db: KcaDb, access: KcaAccess, meetingId: number): Promise<void> {
  await loadOwnMeeting(db, access, meetingId);
  await db.batch([
    { sql: "UPDATE tasks SET meeting_id = NULL WHERE meeting_id = ?", args: [meetingId] },
    { sql: "DELETE FROM meetings WHERE id = ?", args: [meetingId] },
  ]);
}

/** "İşlendi": görevler ve kişiler çıkarıldı (ya da geri açıldı). Yalnız sahibi (KCA Panel resolveMeeting). */
export async function setMeetingProcessed(
  db: KcaDb,
  access: KcaAccess,
  meetingId: number,
  done: boolean,
  result: string | null,
  now: Date = new Date()
): Promise<void> {
  await loadOwnMeeting(db, access, meetingId);
  await db.execute("UPDATE meetings SET processed_at = ?, processed_by = ?, result = ?, updated_at = datetime('now') WHERE id = ?", [
    done ? nowUtc(now) : null,
    done ? access.me.id : null,
    done ? result : null,
    meetingId,
  ]);
}

// ---------- network (kişiye özel) ----------

function contactOf(r: KcaRow): KcaContactDto {
  return {
    id: num(r.id),
    name: String(r.name),
    organization: strOrNull(r.organization),
    referral: strOrNull(r.referral),
    projectId: num(r.project_id),
    projectName: String(r.project_name ?? ""),
    projectColor: String(r.project_color ?? "#3b6fd8"),
    action: strOrNull(r.action),
    status: String(r.status) as KcaContactStatus,
    nextDate: strOrNull(r.next_date),
    phone: strOrNull(r.phone),
    email: strOrNull(r.email),
    notes: strOrNull(r.notes),
    source: strOrNull(r.source),
    taskId: numOrNull(r.task_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

const CONTACT_SELECT = `SELECT c.*, p.name AS project_name, p.color AS project_color FROM contacts c JOIN projects p ON p.id = c.project_id`;

/** Yalnız kendi networkü ve yalnız Edoras firmalı kişiler (KCA Panel contacts + Edoras süzgeci). */
export async function listContacts(db: KcaDb, access: KcaAccess): Promise<KcaContactDto[]> {
  const rows = await q(
    db,
    `${CONTACT_SELECT} WHERE c.owner_id = ? AND c.project_id IN ${inList(access.scope.ids)}
     ORDER BY CASE c.status WHEN 'done' THEN 1 ELSE 0 END, c.next_date IS NULL, c.next_date, c.name`,
    [access.me.id, ...access.scope.ids]
  );
  return rows.map(contactOf);
}

async function loadOwnContact(db: KcaDb, access: KcaAccess, contactId: number): Promise<KcaContactDto> {
  const row = await one(db, `${CONTACT_SELECT} WHERE c.id = ? AND c.owner_id = ? AND c.project_id IN ${inList(access.scope.ids)}`, [
    contactId,
    access.me.id,
    ...access.scope.ids,
  ]);
  if (!row) return fail(404, "NOT_FOUND");
  return contactOf(row);
}

export async function getContact(db: KcaDb, access: KcaAccess, contactId: number): Promise<KcaContactDto> {
  return loadOwnContact(db, access, contactId);
}

const CONTACT_COLUMNS = {
  name: "name",
  organization: "organization",
  referral: "referral",
  projectId: "project_id",
  action: "action",
  status: "status",
  nextDate: "next_date",
  phone: "phone",
  email: "email",
  notes: "notes",
} as const satisfies Record<keyof KcaContactPatchValues, string>;

/** Firma zorunlu ve kişinin gördüğü Edoras projelerinden biri (KCA Panel contactFields → projectPerms). */
export async function createContact(db: KcaDb, access: KcaAccess, input: KcaContactCreateValues): Promise<{ id: number }> {
  projectFor(access, input.projectId);
  const keys = Object.keys(CONTACT_COLUMNS) as (keyof typeof CONTACT_COLUMNS)[];
  const rows = await q(
    db,
    `INSERT INTO contacts (owner_id, ${keys.map((k) => CONTACT_COLUMNS[k]).join(", ")}, source)
     VALUES (?, ${keys.map(() => "?").join(", ")}, 'Edoras CRM') RETURNING id`,
    [access.me.id, ...keys.map((k) => input[k])]
  );
  return { id: num(rows[0].id) };
}

export async function updateContact(db: KcaDb, access: KcaAccess, contactId: number, patch: KcaContactPatchValues): Promise<{ changed: string[] }> {
  await loadOwnContact(db, access, contactId);
  if (patch.projectId !== undefined) projectFor(access, patch.projectId);
  const keys = (Object.keys(CONTACT_COLUMNS) as (keyof typeof CONTACT_COLUMNS)[]).filter((k) => patch[k] !== undefined);
  if (!keys.length) return { changed: [] };
  await db.execute(`UPDATE contacts SET ${keys.map((k) => `${CONTACT_COLUMNS[k]} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`, [
    ...keys.map((k) => patch[k] as KcaArg),
    contactId,
  ]);
  return { changed: keys };
}

export async function deleteContact(db: KcaDb, access: KcaAccess, contactId: number): Promise<void> {
  await loadOwnContact(db, access, contactId);
  await db.execute("DELETE FROM contacts WHERE id = ? AND owner_id = ?", [contactId, access.me.id]);
}
