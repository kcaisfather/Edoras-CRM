import "server-only";

import { randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import type {
  TicketCreateValues,
  TicketDetailDto,
  TicketDto,
  TicketLinkDto,
  TicketNoteDto,
  TicketPatchValues,
  TicketPriority,
  TicketSource,
  TicketStatus,
} from "@/lib/domain/tickets/types";
import { recordAudit } from "./audit";
import { staffNameMap } from "./staff";

/**
 * Destek talepleri (crm_tickets) — yalnız CRM projesi. Aktör oturumdan yazılır. Her yazma işlem kaydına düşer;
 * `details`'e talep eden bilgisi (ad, e-posta, telefon) ve açıklama / not metni YAZILMAZ — yalnız kimlik, durum, öncelik.
 * CRM_AGENT yalnız kendine atayabilir (görevlerdeki kural); ADMIN herkese.
 */

const COLUMNS =
  "id, number, institution_id, subject, description, status, priority, source, assignee_id, requester_name, requester_email, requester_phone, created_at, updated_at, resolved_at";

interface Row {
  id: string;
  number: number | string;
  institution_id: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  assignee_id: string | null;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

async function institutionNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await getSupabaseAdminClient().from("crm_institutions").select("institution_id, institution_name").in("institution_id", ids);
  if (error) throw dbError(error);
  for (const r of (data ?? []) as { institution_id: string; institution_name: string }[]) out.set(r.institution_id, r.institution_name);
  return out;
}

async function noteCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { data, error } = await getSupabaseAdminClient().from("crm_ticket_notes").select("ticket_id").in("ticket_id", ids);
  if (error) throw dbError(error);
  for (const r of (data ?? []) as { ticket_id: string }[]) out.set(r.ticket_id, (out.get(r.ticket_id) ?? 0) + 1);
  return out;
}

async function toDtos(rows: Row[]): Promise<TicketDto[]> {
  const [names, staff, counts] = await Promise.all([
    institutionNames([...new Set(rows.map((r) => r.institution_id))]),
    staffNameMap(),
    noteCounts(rows.map((r) => r.id)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    number: Number(r.number),
    institutionId: r.institution_id,
    institutionName: names.get(r.institution_id) ?? null,
    subject: r.subject,
    description: r.description,
    status: r.status,
    priority: r.priority,
    source: r.source,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_id ? (staff.get(r.assignee_id) ?? null) : null,
    requesterName: r.requester_name,
    requesterEmail: r.requester_email,
    requesterPhone: r.requester_phone,
    noteCount: counts.get(r.id) ?? 0,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
    resolvedAt: r.resolved_at ? Date.parse(r.resolved_at) : null,
  }));
}

async function requireRow(id: string): Promise<Row> {
  const { data, error } = await getSupabaseAdminClient().from("crm_tickets").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as Row;
}

async function requireInstitution(id: string): Promise<string> {
  const { data, error } = await getSupabaseAdminClient().from("crm_institutions").select("institution_name").eq("institution_id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data.institution_name as string;
}

/** CRM_AGENT yalnız kendisine atayabilir. */
function checkAssignee(assigneeId: string | null | undefined, staff: StaffContext) {
  if (assigneeId && staff.role !== "ADMIN" && assigneeId !== staff.userId) throw new HttpError(403, "FORBIDDEN");
}

/** Talepler, en yeni önce. Süzgeçler isteğe bağlı; en çok 1000 satır. */
export async function listTickets(filter: { institutionId?: string; status?: TicketStatus; assigneeId?: string } = {}): Promise<TicketDto[]> {
  let q = getSupabaseAdminClient().from("crm_tickets").select(COLUMNS).order("created_at", { ascending: false }).limit(1000);
  if (filter.institutionId) q = q.eq("institution_id", filter.institutionId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.assigneeId) q = q.eq("assignee_id", filter.assigneeId);
  const { data, error } = await q;
  if (error) throw dbError(error);
  return toDtos((data ?? []) as Row[]);
}

export async function getTicket(id: string): Promise<TicketDetailDto> {
  const row = await requireRow(id);
  const [[dto], notes, staff] = await Promise.all([
    toDtos([row]),
    getSupabaseAdminClient().from("crm_ticket_notes").select("id, author_id, author_name, body, created_at").eq("ticket_id", id).order("created_at", { ascending: true }),
    staffNameMap(),
  ]);
  if (notes.error) throw dbError(notes.error);
  const list: TicketNoteDto[] = ((notes.data ?? []) as { id: string; author_id: string | null; author_name: string | null; body: string; created_at: string }[]).map((n) => ({
    id: n.id,
    authorId: n.author_id,
    authorName: n.author_name ?? (n.author_id ? (staff.get(n.author_id) ?? null) : null),
    body: n.body,
    createdAt: Date.parse(n.created_at),
  }));
  return { ...dto, notes: list };
}

export async function createTicket(input: TicketCreateValues, staff: StaffContext): Promise<TicketDetailDto> {
  const label = await requireInstitution(input.institutionId);
  checkAssignee(input.assigneeId, staff);
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_tickets")
    .insert({
      institution_id: input.institutionId,
      subject: input.subject,
      description: input.description || null,
      priority: input.priority,
      source: "STAFF",
      assignee_id: input.assigneeId,
      requester_name: input.requesterName || null,
      requester_email: input.requesterEmail || null,
      requester_phone: input.requesterPhone || null,
      created_by: staff.userId,
    })
    .select("id, number")
    .single();
  if (error) throw dbError(error); // CRM_TICKET_ASSIGNEE_INVALID
  await recordAudit(staff, {
    action: "TICKET_CREATED",
    entityType: "ticket",
    entityId: data.id as string,
    entityLabel: label,
    details: { number: Number(data.number), priority: input.priority },
  });
  return getTicket(data.id as string);
}

export async function updateTicket(id: string, patch: TicketPatchValues, staff: StaffContext): Promise<TicketDetailDto> {
  const current = await requireRow(id);
  const update: Record<string, unknown> = {};
  if (patch.subject !== undefined && patch.subject !== current.subject) update.subject = patch.subject;
  if (patch.description !== undefined && (patch.description || null) !== current.description) update.description = patch.description || null;
  if (patch.status !== undefined && patch.status !== current.status) update.status = patch.status;
  if (patch.priority !== undefined && patch.priority !== current.priority) update.priority = patch.priority;
  if (patch.assigneeId !== undefined && patch.assigneeId !== current.assignee_id) {
    checkAssignee(patch.assigneeId, staff);
    update.assignee_id = patch.assigneeId;
  }
  if (Object.keys(update).length === 0) return getTicket(id);

  const { error } = await getSupabaseAdminClient().from("crm_tickets").update(update).eq("id", id);
  if (error) throw dbError(error);

  const label = (await institutionNames([current.institution_id])).get(current.institution_id) ?? null;
  const base = { entityType: "ticket" as const, entityId: id, entityLabel: label };
  if (update.status) {
    await recordAudit(staff, { ...base, action: "TICKET_STATUS_CHANGED", details: { number: Number(current.number), from: current.status, to: update.status as string } });
  }
  const fields = Object.keys(update).filter((k) => k !== "status");
  if (fields.length) {
    await recordAudit(staff, { ...base, action: "TICKET_UPDATED", details: { number: Number(current.number), fields: fields.join(",") } });
  }
  return getTicket(id);
}

export async function addTicketNote(ticketId: string, body: string, staff: StaffContext): Promise<TicketDetailDto> {
  const row = await requireRow(ticketId);
  const { error } = await getSupabaseAdminClient()
    .from("crm_ticket_notes")
    .insert({ ticket_id: ticketId, author_id: staff.userId, author_name: staff.fullName ?? staff.email, body });
  if (error) throw dbError(error);
  await recordAudit(staff, {
    action: "TICKET_NOTE_ADDED",
    entityType: "ticket",
    entityId: ticketId,
    entityLabel: (await institutionNames([row.institution_id])).get(row.institution_id) ?? null,
    details: { number: Number(row.number) },
  });
  return getTicket(ticketId);
}

const newToken = () => randomBytes(32).toString("base64url");

/**
 * Kurumun destek bağlantısı (token). Yoksa oluşturulur; `rotate` ise yenilenir ve ESKİ BAĞLANTI GEÇERSİZ OLUR.
 * Token yalnız bu yanıtta ve yönetim ekranında görünür; işlem kaydına yazılmaz.
 */
export async function ensureTicketLink(institutionId: string, rotate: boolean, staff: StaffContext): Promise<TicketLinkDto> {
  const label = await requireInstitution(institutionId);
  const db = getSupabaseAdminClient();
  const { data: existing, error } = await db.from("crm_ticket_links").select("token, created_at").eq("institution_id", institutionId).maybeSingle();
  if (error) throw dbError(error);
  if (existing && !rotate) return { token: existing.token as string, createdAt: Date.parse(existing.created_at as string) };

  const { data, error: writeError } = await db
    .from("crm_ticket_links")
    .upsert({ institution_id: institutionId, token: newToken(), created_by: staff.userId, created_at: new Date().toISOString() }, { onConflict: "institution_id" })
    .select("token, created_at")
    .single();
  if (writeError) throw dbError(writeError);
  await recordAudit(staff, {
    action: existing ? "TICKET_LINK_ROTATED" : "TICKET_LINK_CREATED",
    entityType: "institution",
    entityId: institutionId,
    entityLabel: label,
  });
  return { token: data.token as string, createdAt: Date.parse(data.created_at as string) };
}
