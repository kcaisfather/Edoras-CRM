import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import type { CrmNote } from "@/lib/domain/crm-notes/types";
import { parseNoteContent } from "@/lib/domain/crm-notes/utils";
import { recordAudit } from "./audit";

/**
 * Aday notları (crm_notes). Yazar oturumdan yazılır (author_id + yazıldığı andaki ad); gövdedeki
 * authorId yok sayılır. Notu yalnız yazan ya da yönetici düzenler / siler. İşlem kaydına not metni
 * yazılmaz — yalnız aday ve not türü (önek etiketi).
 */

const NOTE_COLUMNS = "id, lead_id, author_id, author_name, content, created_at, updated_at";

interface NoteRow {
  id: string;
  lead_id: string;
  author_id: string | null;
  author_name: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

function toNote(row: NoteRow): CrmNote {
  return {
    id: row.id,
    leadId: row.lead_id,
    content: row.content,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

const noteKind = (content: string) => parseNoteContent(content).tag ?? "NOT";

/** Adayın notları (yeniden eskiye). Aday yoksa 404. */
export async function listNotes(leadId: string): Promise<CrmNote[]> {
  const db = getSupabaseAdminClient();
  const [lead, notes] = await Promise.all([
    db.from("crm_leads").select("id").eq("id", leadId).maybeSingle(),
    db.from("crm_notes").select(NOTE_COLUMNS).eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);
  if (lead.error) throw dbError(lead.error);
  if (notes.error) throw dbError(notes.error);
  if (!lead.data) throw new HttpError(404, "NOT_FOUND");
  return ((notes.data ?? []) as NoteRow[]).map(toNote);
}

export async function createNote(leadId: string, content: string, staff: StaffContext): Promise<CrmNote> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_notes")
    .insert({ lead_id: leadId, author_id: staff.userId, author_name: staff.fullName ?? staff.email, content })
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw dbError(error); // aday yoksa crm_notes_lead_id_fkey → 404
  const note = toNote(data as NoteRow);
  await recordAudit(staff, {
    action: "NOTE_CREATED",
    entityType: "note",
    entityId: note.id,
    details: { leadId, kind: noteKind(content) },
  });
  return note;
}

/** Notu okur ve yazma yetkisini denetler: yazan ya da ADMIN. */
async function requireOwnNote(leadId: string, noteId: string, staff: StaffContext): Promise<NoteRow> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_notes")
    .select(NOTE_COLUMNS)
    .eq("id", noteId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const row = data as NoteRow;
  if (staff.role !== "ADMIN" && row.author_id !== staff.userId) throw new HttpError(403, "NOTE_NOT_OWNER");
  return row;
}

export async function updateNote(leadId: string, noteId: string, content: string, staff: StaffContext): Promise<CrmNote> {
  const current = await requireOwnNote(leadId, noteId, staff);
  if (current.content === content) return toNote(current);
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_notes")
    .update({ content })
    .eq("id", noteId)
    .select(NOTE_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  await recordAudit(staff, {
    action: "NOTE_UPDATED",
    entityType: "note",
    entityId: noteId,
    details: { leadId, kind: noteKind(content) },
  });
  return toNote(data as NoteRow);
}

export async function deleteNote(leadId: string, noteId: string, staff: StaffContext): Promise<void> {
  const current = await requireOwnNote(leadId, noteId, staff);
  const { error } = await getSupabaseAdminClient().from("crm_notes").delete().eq("id", noteId);
  if (error) throw dbError(error);
  await recordAudit(staff, {
    action: "NOTE_DELETED",
    entityType: "note",
    entityId: noteId,
    details: { leadId, kind: noteKind(current.content) },
  });
}
