import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { addDays, todayIso } from "@/lib/domain/institutions/rules";
import type { CrmStatus } from "@/lib/domain/crm/types";
import { planLeadPatch } from "@/lib/domain/tasks/complete";
import {
  UPCOMING_WINDOW_DAYS,
  countDueOpenTasks,
  deriveTasks,
  filterTasks,
  mergeTasks,
  taskKey,
  type CollectionSummary,
  type DeriveInput,
  type StoredTask,
  type Viewer,
} from "@/lib/domain/tasks/derive";
import { isInstitutionRule, type RuleConfig } from "@/lib/domain/tasks/rules";
import { deriveColdListTasks } from "@/lib/domain/tasks/cold";
import { awaitingSurveyByLead } from "@/lib/domain/surveys/logic";
import { crmContactSets } from "@/lib/domain/cold-lists/utils";
import type { CompleteTaskValues } from "@/lib/domain/tasks/schemas";
import type { AssignmentType, CrmTaskDto, CrmTaskKind, TaskOutcome, TaskStatus, TeamMember } from "@/lib/domain/tasks/types";
import { recordAudit } from "./audit";
import { listTaskProspects } from "./crm-prospects";
import { getRules } from "./crm-rules";
import { awaitingSurveyInvitations } from "./crm-surveys";
import { fetchAll } from "./edoras";
import { internalInstitutionIds } from "./internal-institutions";

/**
 * Görevler (Madde 11). Zamanlayıcı yok: açık kural görevleri her istekte CRM tablolarından türetilir
 * (lib/domain/tasks/derive.ts); crm_tasks'ta yalnız elle atananlar ve tamamlanan kural görevleri durur.
 * Edoras'a gidilmez — kurum durumu CRM kaydından (crm_institutions, crm_licenses, crm_payments) okunur.
 *
 * - Aktör her zaman oturumdan (requireStaff); gövdedeki kimliklere güvenilmez. Kural görevi tamamlanmadan önce
 *   sunucuda yeniden türetilir: istemcinin gönderdiği anahtar bugün gerçekten açık bir görev olmalı.
 * - Görünürlük: kural görevleri ve atanmamış görevler ekip havuzu; atanmış görev yalnız atanan + ADMIN.
 * - Tutar taşınmaz (bakiye görevi yalnız "bakiye var" der; tutar ekranda adaydan, yalnız ADMIN'e).
 * - Soğuk liste görevleri (kural coldList) soğuk liste kişilerinden türetilir (lib/domain/tasks/cold.ts); saklanmaz,
 *   tamamlanmaz (kişinin arama sonucu girilir), menü rozetine sayılmaz. Yalnız liste ucu (listTasks) okur.
 * - Anket araması (kural surveyNoResponse) gönderilmiş / açılmış, yanıtsız davetlerden türetilir; adaya bağlıdır (adayı
 *   olmayan kurum davetinde kurumun bağlı adayı; o da yoksa görev yok — crm_tasks_subject_check kurum yalnız kurum
 *   kurallarına izin verir, şema değiştirilmedi).
 * - İşlem kaydına not metni yazılmaz; yalnız tür, anahtar, sonuç ve statü geçişi.
 */

const TASK_COLUMNS =
  "id, kind, lead_id, institution_id, due_date, status, assignee_id, assignment_type, task_key, note, outcome, result_note, completed_at, completed_by, created_by";

interface TaskRow {
  id: string;
  kind: CrmTaskKind;
  lead_id: string | null;
  institution_id: string | null;
  due_date: string;
  status: TaskStatus;
  assignee_id: string | null;
  assignment_type: AssignmentType | null;
  task_key: string | null;
  note: string | null;
  outcome: TaskOutcome | null;
  result_note: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
}

interface LeadRow {
  id: string;
  organization_name: string | null;
  status: CrmStatus;
  next_follow_up_at: string | null;
  offer_sent_at: string | null;
  updated_at: string;
  institution_id: string | null;
  sale_amount: number | string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

function toStored(r: TaskRow): StoredTask {
  return {
    id: r.id,
    kind: r.kind,
    leadId: r.lead_id,
    institutionId: r.institution_id,
    dueDate: r.due_date,
    status: r.status,
    assigneeId: r.assignee_id,
    type: r.assignment_type,
    key: r.task_key,
    note: r.note,
    outcome: r.outcome,
    resultNote: r.result_note,
    completedAt: r.completed_at ? Date.parse(r.completed_at) : null,
    completedBy: r.completed_by,
    createdBy: r.created_by,
  };
}

const viewerOf = (staff: StaffContext): Viewer => ({ id: staff.userId, isAdmin: staff.role === "ADMIN" });

/** crm_staff adları (atanan / tamamlayan / atayan gösterimi). */
async function staffNames(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseAdminClient().from("crm_staff").select("user_id, full_name");
  if (error) throw dbError(error);
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) if (r.full_name) out.set(r.user_id, r.full_name);
  return out;
}

interface TaskContext {
  input: DeriveInput;
  rules: RuleConfig[];
  stored: StoredTask[];
  names: Map<string, string>;
  leadOfInstitution: Map<string, string>;
  /** CRM adaylarının ve kurum yetkililerinin telefon / e-postası (soğuk liste kişisi CRM'deyse görev olmaz). */
  crmContacts: { phones: Set<string>; emails: Set<string> };
}

/** Türetmenin bütün girdisi (yalnız CRM projesi). Tablolar küçük; sayfalama fetchAll ile. */
async function loadContext(): Promise<TaskContext> {
  const db = getSupabaseAdminClient();
  const [rules, leads, institutions, licenses, payments, internal, tasks, names, surveyInvites] = await Promise.all([
    getRules(),
    fetchAll<LeadRow>((a, b) =>
      db
        .from("crm_leads")
        .select(
          "id, organization_name, status, next_follow_up_at, offer_sent_at, updated_at, institution_id, sale_amount, contact_phone, contact_email"
        )
        .order("id")
        .range(a, b)
    ),
    fetchAll<{
      institution_id: string;
      status: "DEMO" | "UCRETLI";
      demo_ends_at: string | null;
      contact_phone: string | null;
      contact_email: string | null;
    }>((a, b) =>
      db
        .from("crm_institutions")
        .select("institution_id, status, demo_ends_at, contact_phone, contact_email")
        .order("institution_id")
        .range(a, b)
    ),
    fetchAll<{ institution_id: string; ends_on: string }>((a, b) =>
      db.from("crm_licenses").select("institution_id, ends_on").order("id").range(a, b)
    ),
    fetchAll<{ institution_id: string; amount: number | string; paid_on: string }>((a, b) =>
      db.from("crm_payments").select("institution_id, amount, paid_on").order("id").range(a, b)
    ),
    internalInstitutionIds(),
    fetchAll<TaskRow>((a, b) => db.from("crm_tasks").select(TASK_COLUMNS).order("id").range(a, b)),
    staffNames(),
    surveyFollowUpInvites(),
  ]);

  const licenseEnd = new Map<string, string>();
  for (const l of licenses) if (l.ends_on > (licenseEnd.get(l.institution_id) ?? "")) licenseEnd.set(l.institution_id, l.ends_on);
  const collections = new Map<string, CollectionSummary>();
  for (const p of payments) {
    const c = collections.get(p.institution_id) ?? { collected: 0, lastPaidOn: null };
    c.collected += Number(p.amount);
    if (!c.lastPaidOn || p.paid_on > c.lastPaidOn) c.lastPaidOn = p.paid_on;
    collections.set(p.institution_id, c);
  }
  const stored = tasks.map(toStored);
  const leadOfInstitution = new Map(leads.filter((l) => l.institution_id).map((l) => [l.institution_id as string, l.id]));
  const surveys = new Map<string, string>();
  for (const [leadId, sentAt] of awaitingSurveyByLead(surveyInvites, leadOfInstitution, Date.now())) {
    surveys.set(leadId, todayIso(new Date(sentAt)));
  }

  return {
    input: {
      leads: leads.map((l) => ({
        id: l.id,
        status: l.status,
        nextFollowUpAt: l.next_follow_up_at,
        offerSentAt: l.offer_sent_at,
        updatedOn: todayIso(new Date(l.updated_at)),
        institutionId: l.institution_id,
        saleAmount: l.sale_amount == null ? null : Number(l.sale_amount),
      })),
      institutions: institutions.map((i) => ({
        institutionId: i.institution_id,
        status: i.status,
        demoEndsAt: i.demo_ends_at,
        licenseEndsOn: licenseEnd.get(i.institution_id) ?? null,
      })),
      collections,
      internal,
      openAssignedLeadIds: new Set(
        stored.filter((s) => s.kind === "assigned" && s.status === "OPEN" && s.leadId).map((s) => s.leadId as string)
      ),
      surveys,
    },
    rules,
    stored,
    names,
    leadOfInstitution,
    crmContacts: crmContactSets([
      ...leads.map((l) => ({ phone: l.contact_phone, email: l.contact_email })),
      ...institutions.map((i) => ({ phone: i.contact_phone, email: i.contact_email })),
    ]),
  };
}

/**
 * Anket araması girdisi; anket migration'ı (20260929190000) henüz uygulanmamışsa (CONFIG_MISSING) Görevlerim'in geri
 * kalanı çalışsın diye boş döner — Anketler ekranı aynı hatayı açıkça gösterir.
 */
async function surveyFollowUpInvites() {
  try {
    return await awaitingSurveyInvitations();
  } catch (err) {
    if (err instanceof HttpError && err.code === "CONFIG_MISSING") return [];
    throw err;
  }
}

/**
 * Soğuk liste kişileri; soğuk liste migration'ı (20260929180000) henüz uygulanmamışsa (CONFIG_MISSING) Görevlerim'in
 * geri kalanı çalışsın diye boş döner — Soğuk Listeler ekranı aynı hatayı açıkça gösterir.
 */
async function coldProspects() {
  try {
    return await listTaskProspects();
  } catch (err) {
    if (err instanceof HttpError && err.code === "CONFIG_MISSING") return [];
    throw err;
  }
}

/**
 * Çağıranın gördüğü görevler. `cold`: soğuk liste görevleri de türetilir (yalnız Görevlerim listesi; rozet saymaz —
 * DeepSport'taki gibi, yüzlerce aranmamış kişi rozeti anlamsızlaştırır).
 */
async function visibleTasks(
  staff: StaffContext,
  window: { from?: string | null; to: string; status?: TaskStatus | null },
  today: string,
  { cold }: { cold: boolean }
) {
  const [ctx, prospects] = await Promise.all([loadContext(), cold ? coldProspects() : Promise.resolve([])]);
  const merged = mergeTasks(deriveTasks(ctx.input, ctx.rules, today), ctx.stored, ctx);
  const coldTasks = cold ? deriveColdListTasks(prospects, ctx.crmContacts, ctx.rules, today) : [];
  const all = coldTasks.length ? [...merged, ...coldTasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate)) : merged;
  return filterTasks(all, { viewer: viewerOf(staff), today, ...window });
}

// --- Okuma ---------------------------------------------------------------------------------------

/**
 * GET /api/crm/tasks. `to` yoksa bugün + 14 gün; `from` yoksa gecikmiş açık görevler tamamlanana kadar gelir.
 * Tamamlananlar son 90 günde tamamlanmış olanlar.
 */
export async function listTasks(
  staff: StaffContext,
  query: { from: string | null; to: string | null; status: TaskStatus | null }
): Promise<CrmTaskDto[]> {
  const today = todayIso();
  return visibleTasks(
    staff,
    { from: query.from, to: query.to ?? addDays(today, UPCOMING_WINDOW_DAYS), status: query.status },
    today,
    { cold: true }
  );
}

/**
 * Rapor e-postası (lib/server/reports.ts): ekibin TÜM açık görevleri (kural + atanan; soğuk liste görevi yok, tamamlananlar
 * yok). Görünürlük süzmesi (atanmış görev yalnız atanana + ADMIN) çağıranda, alıcı başına yapılır — bağlam bir kez yüklenir.
 */
export async function listOpenTasksForReport(): Promise<CrmTaskDto[]> {
  const ctx = await loadContext();
  return mergeTasks(deriveTasks(ctx.input, ctx.rules, todayIso()), ctx.stored, ctx).filter((t) => t.status === "OPEN");
}

/** Menü rozeti: çağıranın gördüğü gecikmiş + bugün açık görev sayısı. */
export async function dueTaskCount(staff: StaffContext): Promise<number> {
  const today = todayIso();
  return countDueOpenTasks(await visibleTasks(staff, { to: today, status: "OPEN" }, today, { cold: false }), today);
}

/** Görev atanabilecek kişiler: ADMIN için aktif ekip; CRM_AGENT yalnız kendisi (ya da havuz). */
export async function listAssignees(staff: StaffContext): Promise<TeamMember[]> {
  if (staff.role !== "ADMIN") return [{ id: staff.userId, name: staff.fullName ?? staff.email ?? "—" }];
  const { data, error } = await getSupabaseAdminClient().from("crm_staff").select("user_id, full_name").eq("is_active", true);
  if (error) throw dbError(error);
  return ((data ?? []) as { user_id: string; full_name: string | null }[])
    .map((r) => ({ id: r.user_id, name: r.full_name?.trim() || "—" }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

// --- Yazma ---------------------------------------------------------------------------------------

async function getTaskRow(id: string): Promise<TaskRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "TASK_NOT_FOUND");
  return data as TaskRow;
}

type LeadStatusRow = Pick<LeadRow, "id" | "organization_name" | "status" | "next_follow_up_at">;

async function getLead(id: string): Promise<LeadStatusRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .select("id, organization_name, status, next_follow_up_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  return (data as LeadStatusRow | null) ?? null;
}

/** İşlem kaydı etiketi: adayın kurum adı ya da CRM'deki kurum adı. */
async function institutionName(id: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdminClient().from("crm_institutions").select("institution_name").eq("institution_id", id).maybeSingle();
  if (error) throw dbError(error);
  return (data?.institution_name as string | undefined) ?? null;
}

export interface AssignTaskValues {
  leadId: string;
  dueDate: string;
  type: AssignmentType;
  note?: string;
  assigneeId?: string | null;
}

/**
 * "Görev ata". Vade bugün ya da sonrası. ADMIN görevi herhangi bir aktif ekip üyesine atayabilir; CRM_AGENT
 * yalnız kendisine ya da havuza (DeepSport'ta temsilci ekip listesini göremediği için yalnız havuza atayabiliyordu;
 * burada kendine atamak da açık). Aktif personel kuralı veritabanında da (crm_tasks_guard).
 */
export async function assignTask(input: AssignTaskValues, staff: StaffContext): Promise<CrmTaskDto> {
  const assignee = input.assigneeId ?? null;
  if (input.dueDate < todayIso()) throw new HttpError(400, "TASK_PAST_DUE");
  if (staff.role !== "ADMIN" && assignee && assignee !== staff.userId) throw new HttpError(403, "FORBIDDEN");
  const lead = await getLead(input.leadId);
  if (!lead) throw new HttpError(404, "NOT_FOUND");
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_tasks")
    .insert({
      kind: "assigned",
      lead_id: input.leadId,
      due_date: input.dueDate,
      assignment_type: input.type,
      note: input.note?.trim() || null,
      assignee_id: assignee,
      created_by: staff.userId,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw dbError(error);
  const row = data as TaskRow;
  await recordAudit(staff, {
    action: "TASK_ASSIGNED",
    entityType: "task",
    entityId: row.id,
    entityLabel: lead.organization_name,
    details: { leadId: input.leadId, type: input.type, dueDate: input.dueDate, assigneeId: assignee },
  });
  const [dto] = mergeTasks([], [toStored(row)], { names: await staffNames(), leadOfInstitution: new Map() });
  return dto;
}

interface CompletionTarget {
  taskId: string | null;
  key: string | null;
  kind: CrmTaskKind;
  leadId: string | null;
  institutionId: string | null;
  dueDate: string;
}

/** Tamamlanacak görev: elle atanan satır ya da (yeniden türetilip doğrulanan) kural görevi. */
async function completionTarget(body: CompleteTaskValues, staff: StaffContext, today: string): Promise<CompletionTarget> {
  if ("taskId" in body) {
    const row = await getTaskRow(body.taskId);
    if (row.status === "DONE") throw new HttpError(409, "TASK_ALREADY_DONE");
    if (row.assignee_id && row.assignee_id !== staff.userId && staff.role !== "ADMIN") throw new HttpError(403, "TASK_NOT_ASSIGNEE");
    return { taskId: row.id, key: null, kind: row.kind, leadId: row.lead_id, institutionId: null, dueDate: row.due_date };
  }
  const d = body.derived;
  // Soğuk liste görevi tamamlanmaz: kişinin arama sonucu girilir (PATCH /api/crm/prospects/{id}).
  if (d.kind === "coldList") throw new HttpError(400, "VALIDATION");
  const subject = isInstitutionRule(d.kind) ? d.institutionId : d.leadId;
  if (!subject || taskKey(d.kind, subject, d.dueDate) !== d.key) throw new HttpError(400, "VALIDATION");
  const ctx = await loadContext();
  if (ctx.stored.some((s) => s.key === d.key)) throw new HttpError(409, "TASK_ALREADY_DONE");
  // İstemcinin söylediğine değil, bugünkü türetmeye güvenilir: görev hâlâ açık olmalı.
  const task = deriveTasks(ctx.input, ctx.rules, today).find((t) => t.key === d.key);
  if (!task) throw new HttpError(404, "TASK_NOT_FOUND");
  return { taskId: null, key: task.key, kind: task.kind, leadId: task.leadId, institutionId: task.institutionId, dueDate: task.dueDate };
}

/**
 * Görevi tamamlar — tek transaction (crm_complete_task): görev satırı, sonuç notu (adayın notlarına), adayın
 * statüsü / sonraki arama tarihi (applyStatusChange kurallarıyla). Adayı olmayan kurum görevinde statü ve tarih
 * gönderilemez (400 TASK_NO_LEAD); not yalnız görevde kalır.
 */
export async function completeTask(body: CompleteTaskValues, staff: StaffContext): Promise<{ taskId: string }> {
  const today = todayIso();
  if (body.nextFollowUpAt && body.nextFollowUpAt < today) {
    throw new HttpError(400, "VALIDATION", { nextFollowUpAt: "Sonraki arama için bugün ya da sonrası geçerli bir tarih seçin" });
  }
  const target = await completionTarget(body, staff, today);
  const lead = target.leadId ? await getLead(target.leadId) : null;
  const wantsLeadChange = !!body.status || !!body.nextFollowUpAt;
  if (wantsLeadChange && !lead) throw new HttpError(400, "TASK_NO_LEAD");
  const patch = lead && wantsLeadChange
    ? planLeadPatch(
        { status: lead.status, next_follow_up_at: lead.next_follow_up_at },
        { status: body.status ?? null, nextFollowUpAt: body.nextFollowUpAt ?? null, lostReason: body.lostReason ?? null },
        today
      )
    : null;

  const { data, error } = await getSupabaseAdminClient().rpc("crm_complete_task", {
    p_task_id: target.taskId,
    p_task_key: target.key,
    p_kind: target.taskId ? null : target.kind,
    p_lead_id: target.leadId,
    p_institution_id: target.institutionId,
    p_due_date: target.dueDate,
    p_outcome: body.outcome,
    p_note: body.note?.trim() || null,
    p_lead_patch: patch,
    p_actor: staff.userId,
    p_actor_name: staff.fullName ?? staff.email,
  });
  if (error) throw dbError(error);
  const taskId = data as string;

  const label = lead?.organization_name ?? (target.institutionId ? await institutionName(target.institutionId) : null);
  const statusChanged = !!patch?.status && patch.status !== lead?.status;
  await recordAudit(staff, {
    action: "TASK_COMPLETED",
    entityType: "task",
    entityId: taskId,
    entityLabel: label,
    details: {
      kind: target.kind,
      key: target.key,
      leadId: target.leadId,
      institutionId: target.institutionId,
      dueDate: target.dueDate,
      outcome: body.outcome,
      withNote: !!body.note?.trim(),
      ...(patch && "next_follow_up_at" in patch ? { nextFollowUpAt: patch.next_follow_up_at ?? null } : {}),
    },
  });
  if (statusChanged && lead) {
    await recordAudit(staff, {
      action: "LEAD_STATUS_CHANGED",
      entityType: "lead",
      entityId: lead.id,
      entityLabel: lead.organization_name,
      details: {
        from: lead.status,
        to: patch?.status ?? null,
        nextFollowUpAt: patch?.next_follow_up_at ?? null,
        lostReason: patch?.lost_reason ?? null,
        via: "task",
      },
    });
  }
  return { taskId };
}

/**
 * "Geri al" (crm_reopen_task): yalnız tamamlayan ya da ADMIN. Kural görevinin DONE satırı silinir (görev yeniden
 * türetilir), elle atanan görev açılır. Tamamlarken yazılan not ve aday değişiklikleri geri alınmaz.
 */
export async function reopenTask(taskId: string, staff: StaffContext): Promise<void> {
  const row = await getTaskRow(taskId);
  const { error } = await getSupabaseAdminClient().rpc("crm_reopen_task", { p_task_id: taskId, p_actor: staff.userId });
  if (error) throw dbError(error);
  const lead = row.lead_id ? await getLead(row.lead_id) : null;
  await recordAudit(staff, {
    action: "TASK_REOPENED",
    entityType: "task",
    entityId: taskId,
    entityLabel: lead?.organization_name ?? (row.institution_id ? await institutionName(row.institution_id) : null),
    details: { kind: row.kind, key: row.task_key, leadId: row.lead_id, institutionId: row.institution_id, dueDate: row.due_date },
  });
}
