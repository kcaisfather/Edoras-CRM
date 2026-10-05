import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { licenseEndDate, todayIso } from "@/lib/domain/institutions/rules";
import { toBillingProfile, type NewDemoInput, type PaymentInput } from "@/lib/domain/institutions/schemas";
import type { DemoCredentials, PaymentMethod } from "@/lib/domain/institutions/types";
import { sumByInstitution, type CollectionRecord } from "@/lib/domain/crm/collections";
import { planLossDetail, type LossDetailColumns } from "@/lib/domain/crm/loss-detail";
import { applyStatusChange } from "@/lib/domain/crm/offer";
import {
  MSG as SALE_MSG,
  accountIssues,
  positiveAmount,
  toSaleAccount,
  toSaleContact,
  type LeadSaleInput,
  type LeadSaleResult,
  type SaleAccountMode,
} from "@/lib/domain/crm/sale";
import {
  CONTACT_FIELDS,
  toContactColumns,
  type LeadBatchResult,
  type LeadBatchValues,
  type LeadCreateValues,
  type LeadMergeInput,
  type LeadPatchValues,
} from "@/lib/domain/crm/schemas";
import type { CrmLeadDto, CrmStatus, LeadSource, LostReason } from "@/lib/domain/crm/types";
import { COMPLAINT_PREFIX, PROGRAM_PREFIX, latestDissatisfaction, programTags } from "@/lib/domain/crm-notes/utils";
import { recordAudit } from "./audit";
import { fetchAll, getEdorasInstitution } from "./edoras";
import { createDemoInstitution, enrollInstitution, recordPayment } from "./institutions";

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
  "id, organization_name, contact_first_name, contact_last_name, contact_email, contact_phone, whatsapp_username, city, district, country, status, source, offer_amount, sale_amount, lost_reason, lost_note, competitor, recall_at, next_follow_up_at, offer_sent_at, sold_at, institution_id, offer_by, sold_by, owner_id, created_by, updated_by, created_at, updated_at";

interface LeadRow {
  id: string;
  organization_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_username: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  status: CrmStatus;
  source: LeadSource;
  offer_amount: number | string | null;
  sale_amount: number | string | null;
  lost_reason: LostReason | null;
  lost_note: string | null;
  competitor: string | null;
  recall_at: string | null;
  next_follow_up_at: string | null;
  offer_sent_at: string | null;
  sold_at: string | null;
  institution_id: string | null;
  offer_by: string | null;
  sold_by: string | null;
  owner_id: string | null;
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
    whatsappUsername: row.whatsapp_username,
    city: row.city,
    district: row.district,
    country: row.country,
    status: row.status,
    source: row.source,
    offerAmount: ctx.financial ? toNumber(row.offer_amount) : null,
    saleAmount: ctx.financial ? toNumber(row.sale_amount) : null,
    collectedAmount: ctx.financial ? (row.institution_id ? (ctx.sums.get(row.institution_id) ?? 0) : 0) : null,
    lostReason: row.lost_reason,
    lostNote: row.lost_note,
    competitor: row.competitor,
    recallAt: row.recall_at,
    nextFollowUpAt: row.next_follow_up_at,
    offerSentAt: row.offer_sent_at,
    soldAt: row.sold_at,
    institutionId: row.institution_id,
    dissatisfaction: flags?.dissatisfaction ?? null,
    programTags: flags?.programTags ?? [],
    ownerId: row.owner_id,
    ownerName: row.owner_id ? (ctx.names.get(row.owner_id) ?? null) : null,
    createdBy: row.created_by,
    createdByName: row.created_by ? (ctx.names.get(row.created_by) ?? null) : null,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by ? (ctx.names.get(row.updated_by) ?? null) : null,
    offerBy: row.offer_by,
    offerByName: row.offer_by ? (ctx.names.get(row.offer_by) ?? null) : null,
    soldBy: row.sold_by,
    soldByName: row.sold_by ? (ctx.names.get(row.sold_by) ?? null) : null,
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
  // Satış yalnız satış penceresinden (tutar + fatura bilgisi + hesap): yeni aday "Satış oldu" olarak açılamaz.
  if (input.status === "SATIS_OLDU") throw new HttpError(409, "SALE_ACCOUNT_REQUIRED");
  // Teklif verildi: teklif tutarı zorunlu; temsilci de girer (kurucu kararı, 2026-10-05) — diğer tutarlar EK-3.
  const offerAmount = financial || input.status === "TEKLIF_VERILDI" ? (input.offerAmount ?? null) : null;
  if (input.status === "TEKLIF_VERILDI" && !(offerAmount && offerAmount > 0)) {
    throw new HttpError(400, "VALIDATION", { offerAmount: SALE_MSG.offerAmountRequired });
  }
  const status = applyStatusChange({}, { status: input.status, nextDate: input.nextFollowUpAt, lostReason: input.lostReason }, todayIso());
  const loss = planLossDetail(NO_LOSS_DETAIL, input, input.status, status.lost_reason);
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .insert({
      ...toContactColumns(input),
      ...status,
      ...loss,
      ...actorColumns(undefined, input.status, staff),
      source: input.source,
      institution_id: input.institutionId,
      // EK-3: CRM_AGENT'ın gönderdiği tutarlar yok sayılır (teklif statüsündeki teklif tutarı hariç).
      ...(financial ? { offer_amount: offerAmount, sale_amount: input.saleAmount ?? null } : offerAmount ? { offer_amount: offerAmount } : {}),
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

/** Sorumlu olacak kişi aktif bir CRM personeli mi (değilse 400). */
async function requireActiveStaff(userId: string): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().from("crm_staff").select("is_active").eq("user_id", userId).maybeSingle();
  if (error) throw dbError(error);
  if (!data?.is_active) throw new HttpError(400, "VALIDATION", { ownerId: "Aktif bir ekip üyesi seçin" });
}

const NO_LOSS_DETAIL: LossDetailColumns = { lost_note: null, competitor: null, recall_at: null };

/**
 * Teklifi veren / satışı yapan: statü TEKLIF_VERILDI / SATIS_OLDU'ya GEÇİLDİĞİ anda oturumdaki personel yazılır
 * (gövdeden okunmaz; DeepSport lib/domain/crm/actor.ts). Statü aynı kalıyorsa dokunulmaz. SATIS_OLDU'dan çıkışta
 * sold_by temizliği veritabanı tetikleyicisindedir (crm_leads_actor), bu yüzden burada yazılmaz.
 */
function actorColumns(prev: CrmStatus | undefined, next: CrmStatus, staff: StaffContext): { offer_by?: string; sold_by?: string } {
  if (prev === next) return {};
  if (next === "TEKLIF_VERILDI") return { offer_by: staff.userId };
  if (next === "SATIS_OLDU") return { sold_by: staff.userId };
  return {};
}

const COLUMN_OF: Record<(typeof CONTACT_FIELDS)[number], keyof LeadRow> = {
  organizationName: "organization_name",
  contactFirstName: "contact_first_name",
  contactLastName: "contact_last_name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  whatsappUsername: "whatsapp_username",
  city: "city",
  district: "district",
  country: "country",
};

/**
 * Kısmi güncelleme (EK-3): gövdede olmayan alana dokunulmaz. `status` gelirse sonraki arama, kayıp nedeni,
 * teklif ve satış tarihi statü kurallarıyla yazılır (`applyStatusChange`). Değişmeyen alan yazılmaz;
 * hiçbir şey değişmediyse kayıt dokunulmadan döner.
 */
async function patchLead(id: string, patch: LeadPatchValues, staff: StaffContext): Promise<void> {
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

  // Kayıp ayrıntısı: son statü / nedene göre; "Satış olmadı"dan çıkınca temizlenir, rakip yalnız COMPETITOR'da kalır.
  const finalStatus = (update.status as CrmStatus | undefined) ?? current.status;
  const finalReason = "lost_reason" in update ? (update.lost_reason as string | null) : current.lost_reason;
  Object.assign(update, planLossDetail(current, patch, finalStatus, finalReason));
  if (patch.status !== undefined) Object.assign(update, actorColumns(current.status, patch.status, staff));

  // Sorumlu: yalnız ADMIN; hedef aktif bir ekip üyesi olmalı (null = sorumlusuz).
  let ownerChange: { from: string | null; to: string | null } | null = null;
  if (patch.ownerId !== undefined && patch.ownerId !== current.owner_id) {
    if (staff.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN");
    if (patch.ownerId !== null) await requireActiveStaff(patch.ownerId);
    update.owner_id = patch.ownerId;
    ownerChange = { from: current.owner_id, to: patch.ownerId };
  }

  const amounts: Record<string, number | null> = {};
  // Temsilci tutar göremez ve yazamaz (EK-3); tek istisna "Teklif verildi"ye geçerken girdiği teklif tutarı (kurucu
  // kararı, 2026-10-05: teklif tutarı zorunlu, temsilci de girer).
  const enteringOffer = finalStatus === "TEKLIF_VERILDI" && current.status !== "TEKLIF_VERILDI";
  if (financial || enteringOffer) {
    if (patch.offerAmount !== undefined && patch.offerAmount !== toNumber(current.offer_amount)) {
      update.offer_amount = amounts.offerAmount = patch.offerAmount;
    }
  }
  if (financial) {
    if (patch.saleAmount !== undefined && patch.saleAmount !== toNumber(current.sale_amount)) {
      update.sale_amount = amounts.saleAmount = patch.saleAmount;
    }
  }

  // Teklif / satış tutarı zorunlu (lib/domain/crm/sale.ts; veritabanında crm_leads_sale_rules). Satışa geçişin hesap
  // şartı (ücretli kurum + tam fatura profili) veritabanında: yoksa 409 SALE_ACCOUNT_REQUIRED → satış penceresi.
  const finalOffer = "offer_amount" in update ? (update.offer_amount as number | null) : toNumber(current.offer_amount);
  const finalSale = "sale_amount" in update ? (update.sale_amount as number | null) : toNumber(current.sale_amount);
  if (finalStatus === "TEKLIF_VERILDI" && (enteringOffer || "offer_amount" in update) && !(finalOffer && finalOffer > 0)) {
    throw new HttpError(400, "VALIDATION", { offerAmount: SALE_MSG.offerAmountRequired });
  }
  const enteringSale = finalStatus === "SATIS_OLDU" && current.status !== "SATIS_OLDU";
  if (finalStatus === "SATIS_OLDU" && (enteringSale || "sale_amount" in update) && !(finalSale && finalSale > 0)) {
    throw new HttpError(400, "VALIDATION", { saleAmount: SALE_MSG.saleAmountRequired });
  }

  if (Object.keys(update).length === 0) return;
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
  if (ownerChange) {
    await recordAudit(staff, {
      action: "LEAD_OWNER_CHANGED",
      entityType: "lead",
      entityId: id,
      entityLabel: label,
      details: ownerChange,
    });
  }
  const followUpChanged =
    !statusChanged &&
    ("next_follow_up_at" in update || "lost_reason" in update || "lost_note" in update || "competitor" in update || "recall_at" in update);
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
  }

export async function updateLead(id: string, patch: LeadPatchValues, staff: StaffContext): Promise<CrmLeadDto> {
  await patchLead(id, patch, staff);
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
  const status = {
    ...applyStatusChange(current, { status: "DEMO_TANIMLANDI", nextDate: null, lostReason: null }, todayIso()),
    // "Satış olmadı"dan çıkış: kayıp ayrıntısı da temizlenir (crm_leads_loss_detail_check).
    ...planLossDetail(current, {}, "DEMO_TANIMLANDI", null),
  };
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

// --- Satış (tutar + fatura bilgisi + hesap tek adımda) ------------------------------------------------

type SaleRpcResult = { licenseId: string | null; converted: boolean };

/**
 * Satışı kaydeder (her CRM kullanıcısı; kurucu kararı 2026-10-05: "satış yapıldıysa fiyat ve firma bilgileri zorunlu,
 * direkt hesabı açmalı"). Hesap yolu adayın gerçek durumundan seçilir (lib/domain/crm/sale.ts → SaleAccountMode):
 * - NEW: Edoras'ta yeni kurum + kurum yöneticisi (demo açmayla aynı zincir, createDemoInstitution); CRM kaydından sonra
 *   AYNI geri alma zincirinde crm_record_lead_sale ücretliye geçirir (lisans = satış tutarı, bugünden 1 yıl) ve adayı
 *   bağlar. Herhangi bir adım patlarsa Edoras'ta açılanlar da silinir. Geçici şifre yalnız bu yanıtta döner.
 * - ENROLL: bağlı kurumun CRM kaydı yok → önce DEMO olarak kayda alınır, sonra aynı RPC ücretliye geçirir; RPC patlarsa
 *   kayıt geri silinir.
 * - CONVERT (DEMO) / PAID (ücretli): yalnız RPC — fatura profili, (DEMO ise) ücretliye geçiş + lisans, aday "Satış oldu".
 * Ücretli kurumda lisansa dokunulmaz (yenileme kurum sayfasından).
 */
export async function recordLeadSale(id: string, input: LeadSaleInput, staff: StaffContext): Promise<LeadSaleResult> {
  const current = await requireLeadRow(id);
  const amount = positiveAmount(input.saleAmount) as number;
  const billing = toBillingProfile(input);
  const db = getSupabaseAdminClient();
  const requireAccount = (mode: SaleAccountMode) => {
    const issues = accountIssues(input, mode);
    if (issues.length) throw new HttpError(400, "VALIDATION", Object.fromEntries(issues.map((i) => [i.path[0], i.message])));
  };
  const record = async (institutionId: string): Promise<SaleRpcResult> => {
    const { data, error } = await db.rpc("crm_record_lead_sale", {
      p_lead_id: id,
      p_institution_id: institutionId,
      p_sale_amount: amount,
      p_address: billing.address,
      p_tc_no: billing.tcNo,
      p_tax_no: billing.taxNo,
      p_billing_type: billing.billingType,
      p_legal_name: billing.legalName,
      p_tax_office: billing.taxOffice,
      p_city: billing.city,
      p_district: billing.district,
      p_postal_code: billing.postalCode,
      p_email: billing.email,
      p_organization_name: input.institutionName.trim() || null,
      p_actor: staff.userId,
    });
    if (error) throw dbError(error);
    return data as SaleRpcResult;
  };

  let mode: SaleAccountMode;
  let result: SaleRpcResult | null = null;
  let credentials: DemoCredentials | null = null;
  if (!current.institution_id) {
    mode = "NEW";
    requireAccount(mode);
    const created = await createDemoInstitution(toSaleAccount(input), staff, {
      auditAction: "PAID_ACCOUNT_CREATED",
      afterEnroll: async (institutionId) => {
        result = await record(institutionId);
      },
    });
    // Satışla açılan hesap ücretlidir: gösterilen bitiş lisansın bitişi.
    credentials = { ...created, demoEndsAt: licenseEndDate(todayIso()) };
  } else {
    const institutionId = current.institution_id;
    const { data: crm, error } = await db.from("crm_institutions").select("status").eq("institution_id", institutionId).maybeSingle();
    if (error) throw dbError(error);
    if (!crm) {
      mode = "ENROLL";
      requireAccount(mode);
      await enrollInstitution(
        institutionId,
        {
          status: "DEMO",
          ...toSaleContact(input),
          demoStartsOn: todayIso(),
          address: "",
          idType: "TC",
          idNumber: "",
          licenseStartsOn: "",
          licensePrice: "",
        },
        staff
      );
      try {
        result = await record(institutionId);
      } catch (err) {
        // Yeni kaydın lisansı / ödemesi yok: satış yazılamadıysa kayıt da geri alınır (yarım iş kalmaz).
        const { error: undoError } = await db.from("crm_institutions").delete().eq("institution_id", institutionId);
        if (undoError) console.error("[api] satış: CRM kaydı geri alınamadı, elle temizlenmeli");
        throw err;
      }
    } else {
      mode = crm.status === "DEMO" ? "CONVERT" : "PAID";
      result = await record(institutionId);
    }
  }

  const sale = result as SaleRpcResult | null;
  const institutionId = credentials?.institutionId ?? (current.institution_id as string);
  const label = current.organization_name ?? (input.institutionName.trim() || null);
  if (mode === "NEW") {
    await recordAudit(staff, { action: "LEAD_LINKED", entityType: "lead", entityId: id, entityLabel: label, details: { institutionId, via: "sale" } });
  }
  if (sale?.converted && mode !== "NEW") {
    await recordAudit(staff, {
      action: "CONVERTED_TO_PAID",
      entityType: "institution",
      entityId: institutionId,
      details: { licenseStartsOn: todayIso(), price: amount, firstPayment: null, via: "sale" },
    });
  }
  // Değerler (adres, TC/VKN, unvan, e-posta) kayda yazılmaz; yalnız fatura türü.
  await recordAudit(staff, { action: "BILLING_UPDATED", entityType: "institution", entityId: institutionId, details: { billingType: billing.billingType } });
  if (current.status !== "SATIS_OLDU") {
    await recordAudit(staff, {
      action: "LEAD_STATUS_CHANGED",
      entityType: "lead",
      entityId: id,
      entityLabel: label,
      details: { from: current.status, to: "SATIS_OLDU", nextFollowUpAt: null, lostReason: null },
    });
  }
  await recordAudit(staff, {
    action: "LEAD_SALE_RECORDED",
    entityType: "lead",
    entityId: id,
    entityLabel: label,
    details: { saleAmount: amount, institutionId, mode, licenseId: sale?.licenseId ?? null },
  });
  return { lead: await leadDto(id, staff), credentials, mode };
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

// --- Birleştirme ve toplu işlem (yalnız ADMIN; uçlar denetler) -------------------------------------

/**
 * `dropId` adayını `keepId`'ye birleştirir (tek işlemde, veritabanı fonksiyonu crm_merge_leads): notlar, görevler,
 * randevular, anketler ve soğuk liste kişileri taşınır, ana adayın boş alanları doldurulur, silinen aday kalmaz.
 * İkisi de farklı bir kuruma bağlıysa 409 LEAD_MERGE_BOTH_LINKED.
 */
export async function mergeLeads(input: LeadMergeInput, staff: StaffContext): Promise<CrmLeadDto> {
  const [keep] = await Promise.all([requireLeadRow(input.keepId), requireLeadRow(input.dropId)]);
  const { data, error } = await getSupabaseAdminClient().rpc("crm_merge_leads", {
    p_keep: input.keepId,
    p_drop: input.dropId,
    p_actor: staff.userId,
  });
  if (error) throw dbError(error);
  const moved = (data ?? {}) as Record<string, number>;
  await recordAudit(staff, {
    action: "LEADS_MERGED",
    entityType: "lead",
    entityId: input.keepId,
    entityLabel: keep.organization_name,
    details: { droppedId: input.dropId, ...moved },
  });
  return leadDto(input.keepId, staff);
}

/**
 * Toplu işlem: seçili adaylara sırayla uygular (her biri tek tek yazılır ve işlem kaydına düşer). Bir aday hata
 * verirse atlanır (kod `failed` listesinde), kalanlar sürer. Sorumlu atama ve silme yalnız ADMIN (403).
 */
export async function batchLeads(input: LeadBatchValues, staff: StaffContext): Promise<LeadBatchResult> {
  const { action } = input;
  if ((action.type === "owner" || action.type === "delete") && staff.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN");
  if (action.type === "owner" && action.ownerId) await requireActiveStaff(action.ownerId);

  const result: LeadBatchResult = { done: 0, failed: [] };
  for (const id of new Set(input.ids)) {
    try {
      if (action.type === "owner") await patchLead(id, { ownerId: action.ownerId }, staff);
      else if (action.type === "status") await patchLead(id, { status: action.status }, staff);
      else await deleteLead(id, staff);
      result.done += 1;
    } catch (err) {
      result.failed.push({ id, code: err instanceof HttpError ? err.code : "INTERNAL" });
    }
  }
  return result;
}
