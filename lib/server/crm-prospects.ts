import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { cleanText, normalizeImportEmail, normalizeImportPhone } from "@/lib/import/normalize";
import { contactSets, screenImportItems, toProspectColumns, type BulkImportResult, type ImportItemValues } from "@/lib/import/bulk";
import type { ProspectListCreateInput, ProspectPatchValues, ProspectTextField } from "@/lib/domain/cold-lists/schemas";
import { PROSPECT_TEXT_FIELDS, prospectListCreateSchema } from "@/lib/domain/cold-lists/schemas";
import type { MoveStatus, Prospect, ProspectList, ProspectOutcome, ProspectsPage } from "@/lib/domain/cold-lists/types";
import { convertNoteText, isMoved } from "@/lib/domain/cold-lists/utils";
import { COLD_LIST_SCAN_LIMIT, type TaskProspectInput } from "@/lib/domain/tasks/cold";
import { recordAudit } from "./audit";
import { loadContactIndex, skipCounts } from "./crm-import";
import { fetchAll } from "./edoras";

/**
 * Soğuk listeler (crm_prospect_lists, crm_prospects — Madde 13). Listeler ekipçe paylaşılır (DeepSport'ta tarayıcıya
 * özeldi). Liste silme yalnız ADMIN (uç denetler); diğer işlemler her CRM kullanıcısına açık.
 *
 * - Aktör oturumdan; normalize telefon / e-posta, sonuç anı ve taşınma alanları sunucuda yazılır.
 * - Toplu ekleme: sunucu mükerrerleri kendisi ayıklar (dosya içi, aynı liste, CRM adayı, kurum yetkilisi) ve
 *   crm_add_prospects ile ekler; eşzamanlı eklemede kalan liste içi çakışmayı fonksiyon atlar.
 * - İşlem kaydına kişisel veri (ad, telefon, e-posta, not) yazılmaz: yalnız sayılar, sonuç ve değişen ALAN ADLARI.
 *   Etiket liste adı ya da kişinin kurum adıdır (kişi adı değil).
 */

const LIST_COLUMNS = "id, name, source_file, created_by, created_at";
const PROSPECT_COLUMNS =
  "id, list_id, first_name, last_name, organization, phone_raw, phone, email_raw, email, city, district, branch, note, outcome, outcome_at, crm_lead_id, moved_at, created_at";

interface ListRow {
  id: string;
  name: string;
  source_file: string | null;
  created_by: string | null;
  created_at: string;
}

interface ProspectRow {
  id: string;
  list_id: string;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  phone_raw: string | null;
  phone: string | null;
  email_raw: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  branch: string | null;
  note: string | null;
  outcome: ProspectOutcome;
  outcome_at: string | null;
  crm_lead_id: string | null;
  moved_at: string | null;
  created_at: string;
}

const ms = (v: string | null): number | null => (v ? Date.parse(v) : null);

function toProspect(r: ProspectRow): Prospect {
  return {
    id: r.id,
    listId: r.list_id,
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    organization: r.organization ?? "",
    phoneRaw: r.phone_raw ?? "",
    phone: r.phone,
    emailRaw: r.email_raw ?? "",
    email: r.email,
    city: r.city ?? "",
    district: r.district ?? "",
    branch: r.branch ?? "",
    note: r.note ?? "",
    outcome: r.outcome,
    outcomeAt: ms(r.outcome_at),
    crmLeadId: r.crm_lead_id,
    movedAt: ms(r.moved_at),
    createdAt: Date.parse(r.created_at),
  };
}

async function staffNames(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseAdminClient().from("crm_staff").select("user_id, full_name");
  if (error) throw dbError(error);
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) if (r.full_name) out.set(r.user_id, r.full_name);
  return out;
}

async function getListRow(id: string): Promise<ListRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_prospect_lists").select(LIST_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as ListRow;
}

async function getProspectRow(id: string): Promise<ProspectRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_prospects").select(PROSPECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as ProspectRow;
}

// --- Listeler -------------------------------------------------------------------------------------

/** Listeler (eskiden yeniye) + kişi sayıları. */
export async function listProspectLists(): Promise<ProspectList[]> {
  const db = getSupabaseAdminClient();
  const [lists, counts, names] = await Promise.all([
    fetchAll<ListRow>((a, b) => db.from("crm_prospect_lists").select(LIST_COLUMNS).order("created_at").order("id").range(a, b)),
    db.rpc("crm_prospect_list_counts"),
    staffNames(),
  ]);
  if (counts.error) throw dbError(counts.error);
  const countOf = new Map(((counts.data ?? []) as { list_id: string; total: number | string }[]).map((c) => [c.list_id, Number(c.total)]));
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    sourceFile: l.source_file,
    createdAt: Date.parse(l.created_at),
    createdBy: l.created_by,
    createdByName: l.created_by ? (names.get(l.created_by) ?? null) : null,
    prospectCount: countOf.get(l.id) ?? 0,
  }));
}

export async function createProspectList(input: ProspectListCreateInput, staff: StaffContext): Promise<ProspectList> {
  const values = prospectListCreateSchema.parse(input);
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_prospect_lists")
    .insert({ name: values.name, source_file: values.sourceFile, created_by: staff.userId })
    .select(LIST_COLUMNS)
    .single();
  if (error) throw dbError(error);
  const row = data as ListRow;
  await recordAudit(staff, {
    action: "PROSPECT_LIST_CREATED",
    entityType: "prospect_list",
    entityId: row.id,
    entityLabel: row.name,
    details: { fromFile: !!row.source_file },
  });
  return {
    id: row.id,
    name: row.name,
    sourceFile: row.source_file,
    createdAt: Date.parse(row.created_at),
    createdBy: row.created_by,
    createdByName: staff.fullName,
    prospectCount: 0,
  };
}

/** Listeyi ve kişilerini siler (ADMIN — uç denetler). "Sıcağa taşı" ile açılan CRM adayları kalır. */
export async function deleteProspectList(id: string, staff: StaffContext): Promise<void> {
  const db = getSupabaseAdminClient();
  const list = await getListRow(id);
  const { count, error: countError } = await db.from("crm_prospects").select("id", { count: "exact", head: true }).eq("list_id", id);
  if (countError) throw dbError(countError);
  const { data, error } = await db.from("crm_prospect_lists").delete().eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new HttpError(404, "NOT_FOUND");
  await recordAudit(staff, {
    action: "PROSPECT_LIST_DELETED",
    entityType: "prospect_list",
    entityId: id,
    entityLabel: list.name,
    details: { prospects: count ?? 0 },
  });
}

// --- Kişiler --------------------------------------------------------------------------------------

/** Listenin kişileri, ekleme sırasıyla (sayfalı; page 0 tabanlı). */
export async function listProspects(query: { listId: string; page: number; size: number }): Promise<ProspectsPage> {
  const from = query.page * query.size;
  const { data, error, count } = await getSupabaseAdminClient()
    .from("crm_prospects")
    .select(PROSPECT_COLUMNS, { count: "exact" })
    .eq("list_id", query.listId)
    .order("seq")
    .range(from, from + query.size - 1);
  if (error) throw dbError(error);
  return { items: ((data ?? []) as ProspectRow[]).map(toProspect), page: query.page, size: query.size, total: count ?? 0 };
}

/**
 * Toplu ekleme (POST /api/crm/prospect-lists/{id}/prospects/bulk). Satırlar sunucuda normalleştirilir; kusurlu ve
 * mükerrer satırlar nedeniyle `skipped`'te döner. Hiçbir satır eklenmese de işlem kaydı yazılır (sayılar).
 */
export async function bulkAddProspects(listId: string, items: readonly ImportItemValues[], staff: StaffContext): Promise<BulkImportResult> {
  const db = getSupabaseAdminClient();
  const list = await getListRow(listId);
  const [index, inList] = await Promise.all([
    loadContactIndex(),
    fetchAll<{ phone: string | null; email: string | null }>((a, b) =>
      db.from("crm_prospects").select("phone, email").eq("list_id", listId).order("seq").range(a, b)
    ),
  ]);
  const { accepted, skipped } = screenImportItems(items, { target: "coldList", ...index, list: contactSets(inList) });

  let created = 0;
  if (accepted.length > 0) {
    const { data, error } = await db.rpc("crm_add_prospects", {
      p_list_id: listId,
      p_rows: accepted.map(toProspectColumns),
      p_actor: staff.userId,
    });
    if (error) throw dbError(error);
    // Eşzamanlı içe aktarmada aynı listeye az önce eklenmiş telefon / e-posta: fonksiyon atlar, sırasını döndürür.
    const raced = new Set(((data ?? []) as (number | string)[]).map(Number));
    for (const pos of raced) skipped.push({ row: accepted[pos].row, reason: "DUPLICATE_IN_LIST" });
    created = accepted.length - raced.size;
  }
  skipped.sort((a, b) => a.row - b.row);
  await recordAudit(staff, {
    action: "PROSPECTS_IMPORTED",
    entityType: "prospect_list",
    entityId: listId,
    entityLabel: list.name,
    details: { created, skipped: skipped.length, ...skipCounts(skipped) },
  });
  return { created, skipped, dryRun: false };
}

const COLUMN_OF: Record<ProspectTextField, keyof ProspectRow> = {
  firstName: "first_name",
  lastName: "last_name",
  organization: "organization",
  phoneRaw: "phone_raw",
  emailRaw: "email_raw",
  city: "city",
  district: "district",
  branch: "branch",
  note: "note",
};

/** Patch → değişen kolonlar (telefon / e-posta ham değerden yeniden hesaplanır). */
function patchColumns(current: ProspectRow, patch: ProspectPatchValues): { update: Record<string, unknown>; fields: string[] } {
  const update: Record<string, unknown> = {};
  const fields: string[] = [];
  for (const field of PROSPECT_TEXT_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    const column = COLUMN_OF[field];
    const next = (field === "note" || field === "phoneRaw" || field === "emailRaw" ? value.trim() : cleanText(value)) || null;
    if (next === current[column]) continue;
    update[column] = next;
    fields.push(field);
    if (field === "phoneRaw") update.phone = normalizeImportPhone(next);
    if (field === "emailRaw") update.email = normalizeImportEmail(next);
  }
  return { update, fields };
}

/**
 * Kısmi güncelleme. `outcome` gelirse sonucun anı sunucuda yazılır: Aranmadı'da null, diğerlerinde ŞİMDİ — aynı
 * sonuç yeniden girilse de (Ulaşılamadı → bir deneme daha) an yenilenir, görev N gün ileri kayar. Taşınmış kişinin
 * sonucu değiştirilemez (409).
 */
export async function updateProspect(id: string, patch: ProspectPatchValues, staff: StaffContext): Promise<Prospect> {
  const current = await getProspectRow(id);
  const { update, fields } = patchColumns(current, patch);
  if (patch.outcome !== undefined) {
    if (isMoved({ movedAt: ms(current.moved_at) })) throw new HttpError(409, "PROSPECT_ALREADY_MOVED");
    update.outcome = patch.outcome;
    update.outcome_at = patch.outcome === "NOT_CALLED" ? null : new Date().toISOString();
  }
  if (Object.keys(update).length === 0) return toProspect(current);
  const { data, error } = await getSupabaseAdminClient().from("crm_prospects").update(update).eq("id", id).select(PROSPECT_COLUMNS);
  if (error) throw dbError(error);
  const row = (data?.[0] as ProspectRow | undefined) ?? null;
  if (!row) throw new HttpError(404, "NOT_FOUND");
  await recordAudit(staff, {
    action: "PROSPECT_UPDATED",
    entityType: "prospect",
    entityId: id,
    entityLabel: row.organization,
    details: {
      listId: row.list_id,
      ...(patch.outcome !== undefined ? { from: current.outcome, outcome: patch.outcome } : {}),
      // Yalnız alan adları; değerler (kişisel veri) yazılmaz.
      ...(fields.length ? { fields: fields.join(",") } : {}),
    },
  });
  return toProspect(row);
}

export async function deleteProspect(id: string, staff: StaffContext): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().from("crm_prospects").delete().eq("id", id).select("id, list_id, organization, outcome");
  if (error) throw dbError(error);
  const row = data?.[0] as { list_id: string; organization: string | null; outcome: string } | undefined;
  if (!row) throw new HttpError(404, "NOT_FOUND");
  await recordAudit(staff, {
    action: "PROSPECT_DELETED",
    entityType: "prospect",
    entityId: id,
    entityLabel: row.organization,
    details: { listId: row.list_id, outcome: row.outcome },
  });
}

/**
 * "Sıcağa taşı" (crm_convert_prospect, tek transaction): CRM adayı (kaynak COLD_LIST, seçilen statü) + isteğe bağlı
 * not (kişinin program / tür ve notundan sunucu kurar) + kişinin taşındı işareti. Adayı duran kişi → 409.
 */
export async function convertProspect(
  id: string,
  input: { status: MoveStatus; addNote: boolean },
  staff: StaffContext
): Promise<{ crmLeadId: string; prospect: Prospect }> {
  const current = await getProspectRow(id);
  if (current.crm_lead_id) throw new HttpError(409, "PROSPECT_ALREADY_MOVED");
  const note = input.addNote ? convertNoteText({ branch: current.branch ?? "", note: current.note ?? "" }) : null;
  const { data, error } = await getSupabaseAdminClient().rpc("crm_convert_prospect", {
    p_prospect_id: id,
    p_status: input.status,
    p_note: note,
    p_actor: staff.userId,
    p_actor_name: staff.fullName ?? staff.email,
  });
  if (error) throw dbError(error);
  const crmLeadId = data as string;
  await recordAudit(staff, {
    action: "PROSPECT_CONVERTED",
    entityType: "prospect",
    entityId: id,
    entityLabel: current.organization,
    details: { listId: current.list_id, leadId: crmLeadId, status: input.status, withNote: !!note, outcome: current.outcome },
  });
  await recordAudit(staff, {
    action: "LEAD_CREATED",
    entityType: "lead",
    entityId: crmLeadId,
    entityLabel: current.organization,
    details: { status: input.status, source: "COLD_LIST", via: "prospect" },
  });
  return { crmLeadId, prospect: toProspect(await getProspectRow(id)) };
}

// --- Görevlerim ----------------------------------------------------------------------------------

/**
 * "Soğuk liste araması" türetmesinin girdisi (lib/domain/tasks/cold.ts): taşınmamış, ulaşılamamış kişilerin tümü ve
 * aranmamış, telefonu olan kişilerin ilk COLD_LIST_SCAN_LIMIT'i — hepsi ekleme sırasıyla. Görev sınırı
 * (COLD_LIST_NEW_TASK_CAP) türetmede uygulanır.
 */
export async function listTaskProspects(): Promise<TaskProspectInput[]> {
  const db = getSupabaseAdminClient();
  const columns = `seq, ${PROSPECT_COLUMNS}`;
  type Row = ProspectRow & { seq: number | string };
  const [lists, unreachable, fresh] = await Promise.all([
    fetchAll<{ id: string; name: string }>((a, b) => db.from("crm_prospect_lists").select("id, name").order("id").range(a, b)),
    fetchAll<Row>((a, b) =>
      db.from("crm_prospects").select(columns).eq("outcome", "UNREACHABLE").is("moved_at", null).order("seq").range(a, b)
    ),
    db
      .from("crm_prospects")
      .select(columns)
      .eq("outcome", "NOT_CALLED")
      .is("moved_at", null)
      .not("phone_raw", "is", null)
      .order("seq")
      .limit(COLD_LIST_SCAN_LIMIT),
  ]);
  if (fresh.error) throw dbError(fresh.error);
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const rows = [...unreachable, ...((fresh.data ?? []) as Row[])].sort((a, b) => Number(a.seq) - Number(b.seq));
  return rows.map((r) => {
    const p = toProspect(r);
    return {
      id: p.id,
      listId: p.listId,
      listName: listName.get(p.listId) ?? null,
      outcome: p.outcome,
      outcomeAt: p.outcomeAt,
      crmLeadId: p.crmLeadId,
      movedAt: p.movedAt,
      firstName: p.firstName,
      lastName: p.lastName,
      organization: p.organization,
      phoneRaw: p.phoneRaw,
      phone: p.phone,
      email: p.email,
    };
  });
}
