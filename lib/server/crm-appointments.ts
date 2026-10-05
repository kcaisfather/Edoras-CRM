import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { todayIso } from "@/lib/domain/institutions/rules";
import {
  draftToAppointment,
  istanbulToMs,
  msToIstanbul,
  type AppointmentCreateValues,
  type AppointmentDto,
  type AppointmentMode,
  type AppointmentPatchValues,
  type AppointmentStatus,
} from "@/lib/domain/crm/appointment";
import { applyStatusChange } from "@/lib/domain/crm/offer";
import type { CrmStatus } from "@/lib/domain/crm/types";
import { recordAudit } from "./audit";
import { staffNameMap } from "./staff";

/**
 * Randevular (crm_appointments) — yalnız CRM projesi. Aktör oturumdan yazılır; gövdeden okunmaz.
 * Her yazma işlem kaydına düşer; `details`'e link / yer / not (serbest metin, adres) YAZILMAZ.
 * Kurallar (geçmiş saat, tür↔link/yer, kapanan randevu değişmez) veritabanında da zorunlu.
 */

const COLUMNS = "id, lead_id, starts_at, mode, link, location, note, status, assignee_id, created_at";

interface Row {
  id: string;
  lead_id: string;
  starts_at: string;
  mode: AppointmentMode;
  link: string | null;
  location: string | null;
  note: string | null;
  status: AppointmentStatus;
  assignee_id: string | null;
  created_at: string;
}

/** Randevu açıldığında "Randevu planlandı"ya taşınan (henüz görüşme aşamasına gelmemiş) statüler. */
const PROMOTE_FROM: CrmStatus[] = ["ARANACAK", "ULASILAMADI", "TAKIPTE"];

function leadName(l: { organization_name: string | null; contact_first_name: string | null; contact_last_name: string | null }): string | null {
  const person = [l.contact_first_name, l.contact_last_name].filter(Boolean).join(" ").trim();
  return l.organization_name ?? (person || null);
}

async function leadNames(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .select("id, organization_name, contact_first_name, contact_last_name")
    .in("id", ids);
  if (error) throw dbError(error);
  for (const l of (data ?? []) as { id: string; organization_name: string | null; contact_first_name: string | null; contact_last_name: string | null }[]) {
    out.set(l.id, leadName(l));
  }
  return out;
}

async function toDtos(rows: Row[]): Promise<AppointmentDto[]> {
  const [names, staff] = await Promise.all([leadNames([...new Set(rows.map((r) => r.lead_id))]), staffNameMap()]);
  return rows.map((r) => {
    const { date, time } = msToIstanbul(Date.parse(r.starts_at));
    return {
      id: r.id,
      leadId: r.lead_id,
      leadName: names.get(r.lead_id) ?? null,
      date,
      time,
      mode: r.mode,
      link: r.link,
      location: r.location,
      note: r.note,
      status: r.status,
      assigneeId: r.assignee_id,
      assigneeName: r.assignee_id ? (staff.get(r.assignee_id) ?? null) : null,
      createdAt: Date.parse(r.created_at),
    };
  });
}

async function requireRow(id: string): Promise<Row> {
  const { data, error } = await getSupabaseAdminClient().from("crm_appointments").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as Row;
}

async function oneDto(id: string): Promise<AppointmentDto> {
  const [dto] = await toDtos([await requireRow(id)]);
  return dto;
}

/**
 * Randevular, başlangıca göre. `leadId` verilirse o adayın tümü (geçmiş dahil); verilmezse yalnız AÇIK randevular
 * (`status` ile değişir). `from` / `to` İstanbul takvim günleridir (dahil).
 */
export async function listAppointments(filter: { leadId?: string; status?: AppointmentStatus; from?: string; to?: string } = {}): Promise<AppointmentDto[]> {
  let q = getSupabaseAdminClient().from("crm_appointments").select(COLUMNS).order("starts_at", { ascending: true }).limit(2000);
  if (filter.leadId) q = q.eq("lead_id", filter.leadId);
  const status = filter.status ?? (filter.leadId ? undefined : "SCHEDULED");
  if (status) q = q.eq("status", status);
  if (filter.from) q = q.gte("starts_at", new Date(istanbulToMs(filter.from, "00:00")).toISOString());
  if (filter.to) q = q.lt("starts_at", new Date(istanbulToMs(filter.to, "00:00") + 24 * 60 * 60 * 1000).toISOString());
  const { data, error } = await q;
  if (error) throw dbError(error);
  return toDtos((data ?? []) as Row[]);
}

async function requireActiveAssignee(userId: string, staff: StaffContext): Promise<void> {
  // CRM_AGENT yalnız kendisine atayabilir (görevlerdeki kural).
  if (staff.role !== "ADMIN" && userId !== staff.userId) throw new HttpError(403, "FORBIDDEN");
}

export async function createAppointment(input: AppointmentCreateValues, staff: StaffContext): Promise<AppointmentDto> {
  const db = getSupabaseAdminClient();
  const { data: lead, error: leadError } = await db
    .from("crm_leads")
    .select("id, organization_name, status")
    .eq("id", input.leadId)
    .maybeSingle();
  if (leadError) throw dbError(leadError);
  if (!lead) throw new HttpError(404, "NOT_FOUND");

  const assignee = input.assigneeId === undefined ? staff.userId : input.assigneeId;
  if (assignee) await requireActiveAssignee(assignee, staff);

  const a = draftToAppointment({ date: input.date, time: input.time, mode: input.mode, link: input.link, location: input.location, note: input.note });
  const { data, error } = await db
    .from("crm_appointments")
    .insert({
      lead_id: input.leadId,
      starts_at: new Date(istanbulToMs(a.date, a.time)).toISOString(),
      mode: a.mode,
      link: a.link,
      location: a.location,
      note: input.note || null,
      assignee_id: assignee,
      created_by: staff.userId,
    })
    .select("id")
    .single();
  if (error) throw dbError(error); // CRM_APPOINTMENT_PAST / _ASSIGNEE_INVALID
  const id = data.id as string;

  await recordAudit(staff, {
    action: "APPOINTMENT_CREATED",
    entityType: "appointment",
    entityId: id,
    entityLabel: lead.organization_name as string | null,
    details: { leadId: input.leadId, date: a.date, time: a.time, mode: a.mode },
  });

  // Görüşme öncesi aşamadaki aday "Randevu planlandı"ya geçer (diğer statülere dokunulmaz).
  const from = lead.status as CrmStatus;
  if (PROMOTE_FROM.includes(from)) {
    const cols = applyStatusChange({ status: from }, { status: "RANDEVU_PLANLANDI", nextDate: null, lostReason: null }, todayIso());
    const { error: promoteError } = await db.from("crm_leads").update({ ...cols, updated_by: staff.userId }).eq("id", input.leadId);
    if (promoteError) throw dbError(promoteError);
    await recordAudit(staff, {
      action: "LEAD_STATUS_CHANGED",
      entityType: "lead",
      entityId: input.leadId,
      entityLabel: lead.organization_name as string | null,
      details: { from, to: "RANDEVU_PLANLANDI", nextFollowUpAt: null, lostReason: null },
    });
  }
  return oneDto(id);
}

/** Açık randevuyu yeniden planlar (tarih/saat/tür/link/yer/not/atanan) ya da kapatır (`status`). */
export async function updateAppointment(id: string, patch: AppointmentPatchValues, staff: StaffContext): Promise<AppointmentDto> {
  const current = await requireRow(id);
  if (current.status !== "SCHEDULED") throw new HttpError(409, "APPOINTMENT_CLOSED");
  const db = getSupabaseAdminClient();
  const { data: lead, error: leadError } = await db.from("crm_leads").select("organization_name").eq("id", current.lead_id).maybeSingle();
  if (leadError) throw dbError(leadError);
  const label = (lead?.organization_name as string | null | undefined) ?? null;

  // --- Kapat ---
  if (patch.status) {
    const update: Record<string, unknown> = { status: patch.status, resolved_at: new Date().toISOString(), resolved_by: staff.userId };
    if (patch.note !== undefined) update.note = patch.note || null;
    const { error } = await db.from("crm_appointments").update(update).eq("id", id).eq("status", "SCHEDULED");
    if (error) throw dbError(error);
    await recordAudit(staff, {
      action: "APPOINTMENT_CLOSED",
      entityType: "appointment",
      entityId: id,
      entityLabel: label,
      details: { leadId: current.lead_id, outcome: patch.status },
    });
    return oneDto(id);
  }

  // --- Yeniden planla / düzenle ---
  const before = msToIstanbul(Date.parse(current.starts_at));
  const mode = patch.mode ?? current.mode;
  const date = patch.date ?? before.date;
  const time = patch.time ?? before.time;
  const a = draftToAppointment({
    date,
    time,
    mode,
    link: patch.link ?? current.link ?? "",
    location: patch.location ?? current.location ?? "",
    note: "",
  });
  const update: Record<string, unknown> = { mode: a.mode, link: a.link, location: a.location };
  const startsAt = new Date(istanbulToMs(a.date, a.time)).toISOString();
  const moved = date !== before.date || time !== before.time;
  if (moved) update.starts_at = startsAt;
  if (patch.note !== undefined) update.note = patch.note || null;
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId) await requireActiveAssignee(patch.assigneeId, staff);
    update.assignee_id = patch.assigneeId;
  }
  const { error } = await db.from("crm_appointments").update(update).eq("id", id).eq("status", "SCHEDULED");
  if (error) throw dbError(error); // CRM_APPOINTMENT_PAST / _CLOSED / _ASSIGNEE_INVALID
  await recordAudit(staff, {
    action: "APPOINTMENT_RESCHEDULED",
    entityType: "appointment",
    entityId: id,
    entityLabel: label,
    details: { leadId: current.lead_id, date: a.date, time: a.time, mode: a.mode, moved },
  });
  return oneDto(id);
}
