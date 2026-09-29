import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { todayIso } from "@/lib/domain/institutions/rules";
import type { NewDemoInput, PaymentInput } from "@/lib/domain/institutions/schemas";
import type { DemoCredentials, PaymentMethod } from "@/lib/domain/institutions/types";
import { sumByInstitution, type CollectionRecord } from "@/lib/domain/crm/collections";
import { applyStatusChange } from "@/lib/domain/crm/offer";
import { CONTACT_FIELDS, toContactColumns, type LeadCreateValues, type LeadPatchValues } from "@/lib/domain/crm/schemas";
import type { CrmLeadDto, CrmStatus, LeadSource, LostReason } from "@/lib/domain/crm/types";
import { COMPLAINT_PREFIX, PROGRAM_PREFIX, latestDissatisfaction, programTags } from "@/lib/domain/crm-notes/utils";
import { recordAudit } from "./audit";
import { fetchAll, getEdorasInstitution } from "./edoras";
import { createDemoInstitution, recordPayment } from "./institutions";

/**
 * CRM adayları (crm_leads) — yalnız CRM projesi; Edoras'a yalnız kurum doğrulaması ve demo açma
 * (lib/server/institutions.ts → lib/server/edoras.ts) için gidilir.
 *
 * - Aktör (created_by / updated_by) oturumdan yazılır; istek gövdesinde gelse de şema atar (G09 kural 2).
 * - CRM_AGENT'a tutarlar (teklif, satış, tahsilat) sunucuda null döner; gönderdiği tutarlar yok sayılır (EK-3).
 * - Tahsilat = bağlı kurumun crm_payments satırları (ayrı tablo yok).
 * - Her yazma işlem kaydına düşer; `details`'e kişisel veri (ad, telefon, e-posta, not metni) yazılmaz.
 */

const LEAD_COLUMNS =
  "id, organization_name, contact_first_name, contact_last_name, contact_email, contact_phone, city, district, country, status, source, offer_amount, sale_amount, lost_reason, next_follow_up_at, offer_sent_at, sold_at, institution_id, created_by, updated_by, created_at, updated_at";

interface LeadRow {
  id: string;
  organization_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  status: CrmStatus;
  source: LeadSource;
  offer_amount: number | string | null;
  sale_amount: number | string | null;
  lost_reason: LostReason | null;
  next_follow_up_at: string | null;
  offer_sent_at: string | null;
  sold_at: string | null;
  institution_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

type NoteFlagRow = { id: string; lead_id: string; content: string; created_at: string };
type Flags = Pick<CrmLeadDto, "dissatisfaction" | "programTags">;

const isFinancial = (staff: StaffContext) => staff.role === "ADMIN";
const toNumber = (v: number | string | null): number | null => (v == null ? null : Number(v));

// --- Okuma yardımcıları --------------------------------------------------------------------------

/** crm_staff adları (oluşturan / güncelleyen / tahsilatı giren gösterimi). */
async function staffNames(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseAdminClient().from("crm_staff").select("user_id, full_name");
  if (error) throw dbError(error);
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) if (r.full_name) out.set(r.user_id, r.full_name);
  return out;
}

/** Kurum başına tahsilat toplamı (crm_payments). `ids` null → tüm kurumlar. */
async function collectedSums(ids: string[] | null): Promise<Map<string, number>> {
  if (ids && ids.length === 0) return new Map();
  const db = getSupabaseAdminClient();
  const rows = await fetchAll<{ institution_id: string; amount: number | string }>((a, b) => {
    const q = db.from("crm_payments").select("institution_id, amount");
    return (ids ? q.in("institution_id", ids) : q).order("id").range(a, b);
  });
  return sumByInstitution(rows);
}

/** Liste rozetleri: en son şikâyet kaydı ve program etiketleri (yalnız önekli notlar okunur). */
async function noteFlags(leadIds: string[] | null): Promise<Map<string, Flags>> {
  if (leadIds && leadIds.length === 0) return new Map();
  const db = getSupabaseAdminClient();
  const load = (prefix: string) =>
    fetchAll<NoteFlagRow>((a, b) => {
      const q = db.from("crm_notes").select("id, lead_id, content, created_at").like("content", `${prefix}%`);
      return (leadIds ? q.in("lead_id", leadIds) : q).order("created_at", { ascending: false }).order("id").range(a, b);
    });
  const [complaints, programs] = await Promise.all([load(COMPLAINT_PREFIX), load(PROGRAM_PREFIX)]);
  const group = (rows: NoteFlagRow[]) => {
    const map = new Map<string, { id: string; content: string; createdAt: number }[]>();
    for (const r of rows) {
      const list = map.get(r.lead_id) ?? [];
      list.push({ id: r.id, content: r.content, createdAt: Date.parse(r.created_at) });
      map.set(r.lead_id, list);
    }
    return map;
  };
  const byComplaint = group(complaints);
  const byProgram = group(programs);
  const out = new Map<string, Flags>();
  for (const id of new Set([...byComplaint.keys(), ...byProgram.keys()])) {
    out.set(id, { dissatisfaction: latestDissatisfaction(byComplaint.get(id)), programTags: programTags(byProgram.get(id)) });
  }
  return out;
}

interface DtoContext {
  financial: boolean;
  names: Map<string, string>;
  sums: Map<string, number>;
  flags: Map<string, Flags>;
}

function toDto(row: LeadRow, ctx: DtoContext): CrmLeadDto {
  const flags = ctx.flags.get(row.id);
  return {
    id: row.id,
    organizationName: row.organization_name,
    contactFirstName: row.contact_first_name,
    contactLastName: row.contact_last_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    city: row.city,
    district: row.district,
    country: row.country,
    status: row.status,
    source: row.source,
    offerAmount: ctx.financial ? toNumber(row.offer_amount) : null,
    saleAmount: ctx.financial ? toNumber(row.sale_amount) : null,
    collectedAmount: ctx.financial ? (row.institution_id ? (ctx.sums.get(row.institution_id) ?? 0) : 0) : null,
    lostReason: row.lost_reason,
    nextFollowUpAt: row.next_follow_up_at,
    offerSentAt: row.offer_sent_at,
    soldAt: row.sold_at,
    institutionId: row.institution_id,
    dissatisfaction: flags?.dissatisfaction ?? null,
    programTags: flags?.programTags ?? [],
    createdBy: row.created_by,
    createdByName: row.created_by ? (ctx.names.get(row.created_by) ?? null) : null,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by ? (ctx.names.get(row.updated_by) ?? null) : null,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

async function getLeadRow(id: string): Promise<LeadRow | null> {
  const { data, error } = await getSupabaseAdminClient().from("crm_leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  return (data as LeadRow | null) ?? null;
}

async function requireLeadRow(id: string): Promise<LeadRow> {
  const row = await getLeadRow(id);
  if (!row) throw new HttpError(404, "NOT_FOUND");
  return row;
}

/**
 * Adaylar (yeniden eskiye). `id` / `institutionId` verilirse yalnız o satır(lar) ve onların tahsilat ve
 * not özetleri okunur; verilmezse hepsi (CRM ekranı tüm listeyi istemcide süzer — DeepSport G08).
 */
export async function listLeads(staff: StaffContext, filter: { id?: string; institutionId?: string } = {}): Promise<CrmLeadDto[]> {
  const db = getSupabaseAdminClient();
  const single = !!(filter.id || filter.institutionId);
  let rows: LeadRow[];
  if (single) {
    let q = db.from("crm_leads").select(LEAD_COLUMNS);
    if (filter.id) q = q.eq("id", filter.id);
    if (filter.institutionId) q = q.eq("institution_id", filter.institutionId);
    const { data, error } = await q;
    if (error) throw dbError(error);
    rows = (data ?? []) as LeadRow[];
  } else {
    rows = await fetchAll<LeadRow>((a, b) =>
      db.from("crm_leads").select(LEAD_COLUMNS).order("created_at", { ascending: false }).order("id").range(a, b)
    );
  }
  const financial = isFinancial(staff);
  const institutionIds = single ? rows.map((r) => r.institution_id).filter((v): v is string => !!v) : null;
  const [names, sums, flags] = await Promise.all([
    staffNames(),
    financial ? collectedSums(institutionIds) : Promise.resolve(new Map<string, number>()),
    noteFlags(single ? rows.map((r) => r.id) : null),
  ]);
  const ctx: DtoContext = { financial, names, sums, flags };
  return rows.map((r) => toDto(r, ctx));
}

async function leadDto(id: string, staff: StaffContext): Promise<CrmLeadDto> {
  const [lead] = await listLeads(staff, { id });
  if (!lead) throw new HttpError(404, "NOT_FOUND");
  return lead;
}

// --- Yazma ---------------------------------------------------------------------------------------

export async function createLead(input: LeadCreateValues, staff: StaffContext): Promise<CrmLeadDto> {
  if (input.institutionId && !(await getEdorasInstitution(input.institutionId))) throw new HttpError(404, "NOT_FOUND");
  const financial = isFinancial(staff);
  const status = applyStatusChange({}, { status: input.status, nextDate: input.nextFollowUpAt, lostReason: input.lostReason }, todayIso());
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .insert({
      ...toContactColumns(input),
      ...status,
      source: input.source,
      institution_id: input.institutionId,
      // EK-3: CRM_AGENT'ın gönderdiği tutarlar yok sayılır.
      ...(financial ? { offer_amount: input.offerAmount ?? null, sale_amount: input.saleAmount ?? null } : {}),
      created_by: staff.userId,
      updated_by: staff.userId,
    })
    .select("id, organization_name")
    .single();
  if (error) throw dbError(error);
  const id = data.id as string;
  await recordAudit(staff, {
    action: "LEAD_CREATED",
    entityType: "lead",
    entityId: id,
    entityLabel: (data.organization_name as string | null) ?? null,
    details: {
      status: input.status,
      source: input.source,
      institutionId: input.institutionId,
      ...(financial ? { offerAmount: input.offerAmount ?? null, saleAmount: input.saleAmount ?? null } : {}),
    },
  });
  return leadDto(id, staff);
}

const COLUMN_OF: Record<(typeof CONTACT_FIELDS)[number], keyof LeadRow> = {
  organizationName: "organization_name",
  contactFirstName: "contact_first_name",
  contactLastName: "contact_last_name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  city: "city",
  district: "district",
  country: "country",
};

/**
 * Kısmi güncelleme (EK-3): gövdede olmayan alana dokunulmaz. `status` gelirse sonraki arama, kayıp nedeni,
 * teklif ve satış tarihi statü kurallarıyla yazılır (`applyStatusChange`). Değişmeyen alan yazılmaz;
 * hiçbir şey değişmediyse kayıt dokunulmadan döner.
 */
export async function updateLead(id: string, patch: LeadPatchValues, staff: StaffContext): Promise<CrmLeadDto> {
  const current = await requireLeadRow(id);
  const financial = isFinancial(staff);
  const update: Record<string, unknown> = {};

  const contact = toContactColumns(patch);
  const changedFields: string[] = [];
  for (const field of CONTACT_FIELDS) {
    const column = COLUMN_OF[field];
    if (column in contact && contact[column] !== current[column]) {
      update[column] = contact[column];
      changedFields.push(field);
    }
  }

  if (patch.status !== undefined) {
    const cols = applyStatusChange(
      current,
      {
        status: patch.status,
        nextDate: patch.nextFollowUpAt !== undefined ? patch.nextFollowUpAt : current.next_follow_up_at,
        lostReason: patch.lostReason !== undefined ? patch.lostReason : current.lost_reason,
      },
      todayIso()
    );
    for (const [column, value] of Object.entries(cols)) {
      if (current[column as keyof LeadRow] !== value) update[column] = value;
    }
  } else {
    if (patch.nextFollowUpAt !== undefined && patch.nextFollowUpAt !== current.next_follow_up_at) update.next_follow_up_at = patch.nextFollowUpAt;
    if (patch.lostReason !== undefined && patch.lostReason !== current.lost_reason) update.lost_reason = patch.lostReason;
  }

  const amounts: Record<string, number | null> = {};
  if (financial) {
    if (patch.offerAmount !== undefined && patch.offerAmount !== toNumber(current.offer_amount)) {
      update.offer_amount = amounts.offerAmount = patch.offerAmount;
    }
    if (patch.saleAmount !== undefined && patch.saleAmount !== toNumber(current.sale_amount)) {
      update.sale_amount = amounts.saleAmount = patch.saleAmount;
    }
  }

  if (Object.keys(update).length === 0) return leadDto(id, staff);
  update.updated_by = staff.userId;
  const { data, error } = await getSupabaseAdminClient().from("crm_leads").update(update).eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new HttpError(404, "NOT_FOUND");

  const label = (update.organization_name as string | null | undefined) ?? current.organization_name;
  const statusChanged = patch.status !== undefined && patch.status !== current.status;
  if (statusChanged) {
    await recordAudit(staff, {
      action: "LEAD_STATUS_CHANGED",
      entityType: "lead",
      entityId: id,
      entityLabel: label,
      details: {
        from: current.status,
        to: patch.status as CrmStatus,
        nextFollowUpAt: "next_follow_up_at" in update ? (update.next_follow_up_at as string | null) : current.next_follow_up_at,
        lostReason: "lost_reason" in update ? (update.lost_reason as string | null) : current.lost_reason,
      },
    });
  }
  const followUpChanged = !statusChanged && ("next_follow_up_at" in update || "lost_reason" in update);
  if (changedFields.length || Object.keys(amounts).length || followUpChanged) {
    const fields = [...changedFields, ...Object.keys(amounts), ...(followUpChanged ? ["followUp"] : [])];
    await recordAudit(staff, {
      action: "LEAD_UPDATED",
      entityType: "lead",
      entityId: id,
      entityLabel: label,
      // Yalnız alan adları ve tutarlar; iletişim değerleri (kişisel veri) yazılmaz.
      details: { fields: fields.join(","), ...amounts },
    });
  }
  return leadDto(id, staff);
}

export async function deleteLead(id: string, staff: StaffContext): Promise<void> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .delete()
    .eq("id", id)
    .select("id, organization_name, institution_id, status");
  if (error) throw dbError(error);
  const row = data?.[0] as { organization_name: string | null; institution_id: string | null; status: string } | undefined;
  if (!row) throw new HttpError(404, "NOT_FOUND");
  await recordAudit(staff, {
    action: "LEAD_DELETED",
    entityType: "lead",
    entityId: id,
    entityLabel: row.organization_name,
    details: { status: row.status, institutionId: row.institution_id },
  });
}

/** Adayı mevcut bir Edoras kurumuna bağlar (kurum başına tek aday; kurum adı boşsa kurumunkini alır). */
export async function linkLead(id: string, institutionId: string, staff: StaffContext): Promise<CrmLeadDto> {
  const [current, institution] = await Promise.all([requireLeadRow(id), getEdorasInstitution(institutionId)]);
  if (!institution) throw new HttpError(404, "NOT_FOUND");
  if (current.institution_id === institutionId) return leadDto(id, staff);
  if (current.institution_id) throw new HttpError(409, "LEAD_ALREADY_LINKED");
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .update({
      institution_id: institutionId,
      updated_by: staff.userId,
      ...(current.organization_name ? {} : { organization_name: institution.name }),
    })
    .eq("id", id)
    .is("institution_id", null)
    .select("id");
  if (error) throw dbError(error); // crm_leads_institution_id_key → 409 LEAD_INSTITUTION_TAKEN
  if (!data?.length) throw new HttpError(409, "LEAD_ALREADY_LINKED");
  await recordAudit(staff, {
    action: "LEAD_LINKED",
    entityType: "lead",
    entityId: id,
    entityLabel: current.organization_name ?? institution.name,
    details: { institutionId, via: "manual" },
  });
  return leadDto(id, staff);
}

/** Kurum bağlantısını kaldırır (yanlış eşleşmeyi düzeltmek için). Kurumun kaydına dokunmaz. */
export async function unlinkLead(id: string, staff: StaffContext): Promise<CrmLeadDto> {
  const current = await requireLeadRow(id);
  if (!current.institution_id) return leadDto(id, staff);
  const { error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .update({ institution_id: null, updated_by: staff.userId })
    .eq("id", id);
  if (error) throw dbError(error);
  await recordAudit(staff, {
    action: "LEAD_UNLINKED",
    entityType: "lead",
    entityId: id,
    entityLabel: current.organization_name,
    details: { institutionId: current.institution_id },
  });
  return leadDto(id, staff);
}

/**
 * Adaydan demo açar: yeni demo kurum (Edoras + CRM kaydı, lib/server/institutions.ts) ve AYNI geri alma
 * zincirinde adayın kuruma bağlanması + statünün "Demo tanımlandı" olması. Bağlama patlarsa demo da geri
 * alınır (yarım iş kalmaz). Geçici şifre yalnız bu yanıtta döner.
 */
export async function openLeadDemo(id: string, input: NewDemoInput, staff: StaffContext): Promise<DemoCredentials> {
  const current = await requireLeadRow(id);
  if (current.institution_id) throw new HttpError(409, "LEAD_ALREADY_LINKED");
  const status = applyStatusChange(current, { status: "DEMO_TANIMLANDI", nextDate: null, lostReason: null }, todayIso());
  const credentials = await createDemoInstitution(input, staff, {
    afterEnroll: async (institutionId) => {
      const { data, error } = await getSupabaseAdminClient()
        .from("crm_leads")
        .update({
          ...status,
          institution_id: institutionId,
          updated_by: staff.userId,
          ...(current.organization_name ? {} : { organization_name: input.institutionName }),
        })
        .eq("id", id)
        .is("institution_id", null)
        .select("id");
      if (error) throw dbError(error);
      if (!data?.length) throw new HttpError(409, "LEAD_ALREADY_LINKED");
    },
  });
  const label = current.organization_name ?? input.institutionName.trim();
  await recordAudit(staff, {
    action: "LEAD_LINKED",
    entityType: "lead",
    entityId: id,
    entityLabel: label,
    details: { institutionId: credentials.institutionId, via: "demo" },
  });
  if (current.status !== "DEMO_TANIMLANDI") {
    await recordAudit(staff, {
      action: "LEAD_STATUS_CHANGED",
      entityType: "lead",
      entityId: id,
      entityLabel: label,
      details: { from: current.status, to: "DEMO_TANIMLANDI", nextFollowUpAt: null, lostReason: null },
    });
  }
  return credentials;
}

// --- Tahsilat (bağlı kurumun ödemeleri) ------------------------------------------------------------

type PaymentRow = {
  id: string;
  institution_id: string;
  amount: number | string;
  paid_on: string;
  method: PaymentMethod;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/** Adayın tahsilat geçmişi (yeniden eskiye). Yalnız ADMIN (uç denetler). Bağlı değilse boş. */
export async function listLeadCollections(id: string): Promise<CollectionRecord[]> {
  const current = await requireLeadRow(id);
  if (!current.institution_id) return [];
  const [payments, names] = await Promise.all([
    getSupabaseAdminClient()
      .from("crm_payments")
      .select("id, institution_id, amount, paid_on, method, note, created_by, created_at")
      .eq("institution_id", current.institution_id)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false }),
    staffNames(),
  ]);
  if (payments.error) throw dbError(payments.error);
  return ((payments.data ?? []) as PaymentRow[]).map((p) => ({
    id: p.id,
    institutionId: p.institution_id,
    amount: Number(p.amount),
    date: p.paid_on,
    method: p.method,
    note: p.note ?? "",
    actorId: p.created_by,
    actorName: p.created_by ? (names.get(p.created_by) ?? null) : null,
    createdAt: Date.parse(p.created_at),
  }));
}

/**
 * Tahsilat ekler = bağlı kuruma ödeme kaydı (crm_payments). Aday bağlı değilse 409 LEAD_NOT_LINKED;
 * kurum CRM'e kayıtlı değilse 404 NOT_ENROLLED; fatura bilgisi eksikse veritabanı reddeder (BILLING_REQUIRED).
 */
export async function recordLeadCollection(id: string, input: PaymentInput, staff: StaffContext): Promise<void> {
  const current = await requireLeadRow(id);
  if (!current.institution_id) throw new HttpError(409, "LEAD_NOT_LINKED");
  await recordPayment(current.institution_id, input, staff, { leadId: id });
}
