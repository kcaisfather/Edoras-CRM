import "server-only";

import { randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { buildSatisfactionIndex, effectiveStatus, satisfactionFor, summarizeResponses } from "@/lib/domain/surveys/logic";
import { buildSurveyEmail, buildSurveyLink } from "@/lib/domain/surveys/message";
import type { CreateInvitationValues, InvitationQuery, ResponseQuery } from "@/lib/domain/surveys/schemas";
import type {
  CreatedSurveyInvitation,
  Paged,
  SatisfactionIndex,
  Survey,
  SurveyChannel,
  SurveyInvitation,
  SurveyInvitationStatus,
  SurveyQuestion,
  SurveyResponse,
  SurveySatisfaction,
  SurveySummary,
  SurveysListResponse,
} from "@/lib/domain/surveys/types";
import { recordAudit } from "./audit";
import { fetchAll } from "./edoras";
import { isMailConfigured, sendMail } from "./mail";

/**
 * Anketler (crm_surveys, crm_survey_invitations, crm_survey_responses — Madde 6–7). Panel uçları her CRM kullanıcısına
 * açık (DeepSport'ta da ADMIN ve CRM_AGENT); tutar yok. Herkese açık sayfanın uçları ayrı: ./public-surveys.ts.
 *
 * - Puanı yalnız müşteri verir: bu modülde puan yazan hiçbir fonksiyon yoktur.
 * - Alıcı bilgisi (ad, kurum, e-posta, telefon) aday / kurum kaydından SUNUCUDA okunur; istemcinin yazdığı adrese anket
 *   gitmez. Token sunucuda üretilir (crypto, 32 bayt).
 * - Aynı alıcıya 7 gün içinde yanıtsız davet varsa yenisi açılmaz (crm_create_survey_invitation) — e-posta da gitmez.
 * - Süre dolumu okurken hesaplanır (effectiveStatus); zamanlayıcı yok.
 * - İşlem kaydına e-posta / telefon / yorum yazılmaz: kanal, anket, aday / kurum kimliği.
 */

const SURVEY_COLUMNS = "id, code, title, intro, questions, is_default, link_valid_days, created_at";
const INVITATION_COLUMNS =
  "id, survey_id, token, lead_id, institution_id, recipient_name, organization_name, email, phone, channel, status, created_at, sent_at, opened_at, responded_at, expires_at, created_by, error";
const RESPONSE_COLUMNS = "id, survey_id, invitation_id, lead_id, institution_id, nps, csat, comment, created_at";

interface SurveyRow {
  id: string;
  code: string;
  title: string;
  intro: string | null;
  questions: SurveyQuestion[];
  is_default: boolean;
  link_valid_days: number;
  created_at: string;
}

interface InvitationRow {
  id: string;
  survey_id: string;
  token: string;
  lead_id: string | null;
  institution_id: string | null;
  recipient_name: string | null;
  organization_name: string | null;
  email: string | null;
  phone: string | null;
  channel: SurveyChannel;
  status: SurveyInvitationStatus;
  created_at: string;
  sent_at: string | null;
  opened_at: string | null;
  responded_at: string | null;
  expires_at: string;
  created_by: string | null;
  error: string | null;
}

interface ResponseRow {
  id: string;
  survey_id: string;
  invitation_id: string;
  lead_id: string | null;
  institution_id: string | null;
  nps: number | null;
  csat: number | null;
  comment: string | null;
  created_at: string;
}

const ms = (v: string | null): number | null => (v ? Date.parse(v) : null);

function toSurvey(r: SurveyRow): Survey {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    intro: r.intro,
    questions: r.questions,
    isDefault: r.is_default,
    linkValidDays: r.link_valid_days,
    createdAt: ms(r.created_at),
  };
}

function toInvitation(r: InvitationRow, names: ReadonlyMap<string, string>, now = Date.now()): SurveyInvitation {
  const expiresAt = Date.parse(r.expires_at);
  return {
    id: r.id,
    surveyId: r.survey_id,
    token: r.token,
    leadId: r.lead_id,
    institutionId: r.institution_id,
    recipientName: r.recipient_name,
    organizationName: r.organization_name,
    email: r.email,
    phone: r.phone,
    channel: r.channel,
    status: effectiveStatus({ status: r.status, expiresAt }, now),
    createdAt: Date.parse(r.created_at),
    sentAt: ms(r.sent_at),
    openedAt: ms(r.opened_at),
    respondedAt: ms(r.responded_at),
    expiresAt,
    createdBy: r.created_by,
    createdByName: r.created_by ? (names.get(r.created_by) ?? null) : null,
    error: r.error,
  };
}

async function staffNames(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseAdminClient().from("crm_staff").select("user_id, full_name");
  if (error) throw dbError(error);
  const out = new Map<string, string>();
  for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) if (r.full_name) out.set(r.user_id, r.full_name);
  return out;
}

async function getSurveyRow(id: string): Promise<SurveyRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_surveys").select(SURVEY_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as SurveyRow;
}

async function getInvitationRow(id: string): Promise<InvitationRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_survey_invitations").select(INVITATION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as InvitationRow;
}

async function invitationDto(id: string): Promise<SurveyInvitation> {
  const [row, names] = await Promise.all([getInvitationRow(id), staffNames()]);
  return toInvitation(row, names);
}

// --- Okuma ---------------------------------------------------------------------------------------

/** GET /api/crm/surveys — anketler (varsayılan önce) + e-posta gönderimi açık mı. */
export async function listSurveys(): Promise<SurveysListResponse> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_surveys")
    .select(SURVEY_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw dbError(error);
  return { surveys: ((data ?? []) as SurveyRow[]).map(toSurvey), mailEnabled: isMailConfigured() };
}

/**
 * Davetler (yeniden eskiye, sayfalı). `status` ekrandaki durumdur: EXPIRED = yazılı EXPIRED ya da süresi geçmiş ve
 * yanıtlanmamış; diğerleri süresi dolmamış olanlar.
 */
export async function listInvitations(surveyId: string, query: InvitationQuery): Promise<Paged<SurveyInvitation>> {
  await getSurveyRow(surveyId);
  const nowIso = new Date().toISOString();
  let q = getSupabaseAdminClient()
    .from("crm_survey_invitations")
    .select(INVITATION_COLUMNS, { count: "exact" })
    .eq("survey_id", surveyId);
  if (query.channel) q = q.eq("channel", query.channel);
  // Zaman değeri PostgREST'in ayrılmış karakterlerini (".", ":") taşıdığı için tırnak içinde.
  if (query.status === "EXPIRED") q = q.or(`status.eq.EXPIRED,and(status.neq.RESPONDED,expires_at.lte."${nowIso}")`);
  else if (query.status === "RESPONDED") q = q.eq("status", "RESPONDED");
  else if (query.status) q = q.eq("status", query.status).gt("expires_at", nowIso);
  const from = query.page * query.size;
  const [{ data, error, count }, names] = await Promise.all([
    q.order("created_at", { ascending: false }).order("id").range(from, from + query.size - 1),
    staffNames(),
  ]);
  if (error) throw dbError(error);
  const now = Date.now();
  return {
    items: ((data ?? []) as InvitationRow[]).map((r) => toInvitation(r, names, now)),
    page: query.page,
    size: query.size,
    total: count ?? 0,
  };
}

type EmbeddedInvitation = { recipient_name: string | null; organization_name: string | null };

/** Yanıtlar (yeniden eskiye, sayfalı) — yanıtlayanın adı ve kurumu davetten. */
export async function listResponses(surveyId: string, query: ResponseQuery): Promise<Paged<SurveyResponse>> {
  await getSurveyRow(surveyId);
  const from = query.page * query.size;
  const { data, error, count } = await getSupabaseAdminClient()
    .from("crm_survey_responses")
    .select(`${RESPONSE_COLUMNS}, crm_survey_invitations(recipient_name, organization_name)`, { count: "exact" })
    .eq("survey_id", surveyId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + query.size - 1);
  if (error) throw dbError(error);
  const rows = (data ?? []) as unknown as (ResponseRow & { crm_survey_invitations: EmbeddedInvitation | EmbeddedInvitation[] | null })[];
  return {
    items: rows.map((r) => {
      const inv = Array.isArray(r.crm_survey_invitations) ? r.crm_survey_invitations[0] : r.crm_survey_invitations;
      return {
        id: r.id,
        surveyId: r.survey_id,
        invitationId: r.invitation_id,
        leadId: r.lead_id,
        institutionId: r.institution_id,
        recipientName: inv?.recipient_name ?? null,
        organizationName: inv?.organization_name ?? null,
        nps: r.nps,
        csat: r.csat,
        comment: r.comment,
        createdAt: Date.parse(r.created_at),
      };
    }),
    page: query.page,
    size: query.size,
    total: count ?? 0,
  };
}

/** Özet: müşteriye ulaşan (gönderim anı olan) davet sayısı + yanıtlardan NPS, dağılım, memnuniyet ortalaması. */
export async function surveySummary(surveyId: string): Promise<SurveySummary> {
  await getSurveyRow(surveyId);
  const db = getSupabaseAdminClient();
  const [responses, sent] = await Promise.all([
    fetchAll<{ id: string; nps: number | null; csat: number | null; created_at: string }>((a, b) =>
      db.from("crm_survey_responses").select("id, nps, csat, created_at").eq("survey_id", surveyId).order("id").range(a, b)
    ),
    db.from("crm_survey_invitations").select("id", { count: "exact", head: true }).eq("survey_id", surveyId).not("sent_at", "is", null),
  ]);
  if (sent.error) throw dbError(sent.error);
  return summarizeResponses(
    responses.map((r) => ({ nps: r.nps, csat: r.csat, createdAt: Date.parse(r.created_at) })),
    sent.count ?? 0
  );
}

type SubjectFilter = { leadIds: string[]; institutionIds: string[] };

/** Rozet verisi: yanıtlar + bekleyen davetler (filtre verilirse yalnız o adaylar / kurumlar). */
async function loadSatisfaction(filter: SubjectFilter | null): Promise<SatisfactionIndex> {
  if (filter && !filter.leadIds.length && !filter.institutionIds.length) return { byLead: {}, byInstitution: {} };
  const db = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const or = filter
    ? [
        ...filter.leadIds.map((id) => `lead_id.eq.${id}`),
        ...filter.institutionIds.map((id) => `institution_id.eq.${id}`),
      ].join(",")
    : null;
  const [responses, invitations] = await Promise.all([
    fetchAll<Pick<ResponseRow, "id" | "lead_id" | "institution_id" | "nps" | "csat" | "created_at">>((a, b) => {
      const q = db.from("crm_survey_responses").select("id, lead_id, institution_id, nps, csat, created_at");
      return (or ? q.or(or) : q).order("id").range(a, b);
    }),
    fetchAll<Pick<InvitationRow, "id" | "token" | "status" | "sent_at" | "created_at" | "expires_at" | "lead_id" | "institution_id">>((a, b) => {
      const q = db
        .from("crm_survey_invitations")
        .select("id, token, status, sent_at, created_at, expires_at, lead_id, institution_id")
        .in("status", ["CREATED", "SENT", "OPENED"])
        .gt("expires_at", nowIso);
      return (or ? q.or(or) : q).order("id").range(a, b);
    }),
  ]);
  return buildSatisfactionIndex(
    responses.map((r) => ({ leadId: r.lead_id, institutionId: r.institution_id, nps: r.nps, csat: r.csat, createdAt: Date.parse(r.created_at) })),
    invitations.map((i) => ({
      id: i.id,
      token: i.token,
      status: i.status,
      sentAt: ms(i.sent_at),
      createdAt: Date.parse(i.created_at),
      expiresAt: Date.parse(i.expires_at),
      leadId: i.lead_id,
      institutionId: i.institution_id,
    })),
    Date.now()
  );
}

/** GET /api/crm/surveys/satisfaction (parametresiz) — tüm adaylar ve kurumlar (liste rozetleri tek istekle). */
export function satisfactionIndex(): Promise<SatisfactionIndex> {
  return loadSatisfaction(null);
}

const EMPTY_SATISFACTION: SurveySatisfaction = {
  responseCount: 0,
  lastNps: null,
  lastCsat: null,
  lastResponseAt: null,
  pendingInvitation: null,
};

/**
 * GET /api/crm/surveys/satisfaction?leadId= | ?institutionId= — tek aday / kurum. Aday bağlı kurumuyla, kurum bağlı
 * adayıyla birlikte değerlendirilir (davet hangisine açıldıysa).
 */
export async function subjectSatisfaction(ids: { leadId?: string; institutionId?: string }): Promise<SurveySatisfaction> {
  const db = getSupabaseAdminClient();
  let leadId = ids.leadId ?? null;
  let institutionId = ids.institutionId ?? null;
  if (leadId && !institutionId) {
    const { data, error } = await db.from("crm_leads").select("institution_id").eq("id", leadId).maybeSingle();
    if (error) throw dbError(error);
    institutionId = (data?.institution_id as string | null | undefined) ?? null;
  } else if (institutionId && !leadId) {
    const { data, error } = await db.from("crm_leads").select("id").eq("institution_id", institutionId).maybeSingle();
    if (error) throw dbError(error);
    leadId = (data?.id as string | undefined) ?? null;
  }
  const index = await loadSatisfaction({ leadIds: leadId ? [leadId] : [], institutionIds: institutionId ? [institutionId] : [] });
  return satisfactionFor(index, { leadId, institutionId }) ?? EMPTY_SATISFACTION;
}

/**
 * Görevlerim (kural surveyNoResponse) girdisi: gönderilmiş / açılmış, süresi dolmamış davetler. Aday başına en son
 * gönderim `awaitingSurveyByLead` ile seçilir (adayı olmayan davet kurumun bağlı adayına düşer).
 */
export async function awaitingSurveyInvitations(): Promise<
  Pick<SurveyInvitation, "status" | "sentAt" | "expiresAt" | "leadId" | "institutionId">[]
> {
  const db = getSupabaseAdminClient();
  const rows = await fetchAll<Pick<InvitationRow, "id" | "status" | "sent_at" | "expires_at" | "lead_id" | "institution_id">>((a, b) =>
    db
      .from("crm_survey_invitations")
      .select("id, status, sent_at, expires_at, lead_id, institution_id")
      .in("status", ["SENT", "OPENED"])
      .gt("expires_at", new Date().toISOString())
      .order("id")
      .range(a, b)
  );
  return rows.map((r) => ({
    status: r.status,
    sentAt: ms(r.sent_at),
    expiresAt: Date.parse(r.expires_at),
    leadId: r.lead_id,
    institutionId: r.institution_id,
  }));
}

// --- Yazma ---------------------------------------------------------------------------------------

interface Recipient {
  leadId: string | null;
  institutionId: string | null;
  name: string | null;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
}

type LeadContactRow = {
  id: string;
  organization_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  institution_id: string | null;
};
type InstitutionContactRow = { institution_name: string; contact_name: string; contact_email: string; contact_phone: string };

const LEAD_CONTACT = "id, organization_name, contact_first_name, contact_last_name, contact_email, contact_phone, institution_id";

/**
 * Alıcı: aday verilirse aday (bağlı kurumu da); yalnız kurum verilirse kurumun bağlı adayı (varsa) + CRM kurum kaydı.
 * İletişim önce adaydan, eksikse kurum yetkilisinden. Ne aday ne CRM kurum kaydı varsa 404.
 */
async function resolveRecipient(input: CreateInvitationValues["recipient"]): Promise<Recipient> {
  const db = getSupabaseAdminClient();
  let lead: LeadContactRow | null = null;
  if (input.leadId) {
    const { data, error } = await db.from("crm_leads").select(LEAD_CONTACT).eq("id", input.leadId).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new HttpError(404, "NOT_FOUND");
    lead = data as LeadContactRow;
  } else if (input.institutionId) {
    const { data, error } = await db.from("crm_leads").select(LEAD_CONTACT).eq("institution_id", input.institutionId).maybeSingle();
    if (error) throw dbError(error);
    lead = (data as LeadContactRow | null) ?? null;
  }
  const institutionId = lead ? lead.institution_id : (input.institutionId ?? null);
  let inst: InstitutionContactRow | null = null;
  if (institutionId) {
    const { data, error } = await db
      .from("crm_institutions")
      .select("institution_name, contact_name, contact_email, contact_phone")
      .eq("institution_id", institutionId)
      .maybeSingle();
    if (error) throw dbError(error);
    inst = (data as InstitutionContactRow | null) ?? null;
  }
  if (!lead && !inst) throw new HttpError(404, "NOT_FOUND");
  const leadName = lead ? [lead.contact_first_name, lead.contact_last_name].filter(Boolean).join(" ").trim() : "";
  return {
    leadId: lead?.id ?? null,
    institutionId,
    name: leadName || inst?.contact_name || null,
    organizationName: lead?.organization_name ?? inst?.institution_name ?? null,
    email: (lead?.contact_email ?? inst?.contact_email ?? null)?.trim().toLowerCase() || null,
    phone: lead?.contact_phone ?? inst?.contact_phone ?? null,
  };
}

/** Kişiye özel link anahtarı: 32 bayt rastgele → base64url (43 karakter). */
const newToken = () => randomBytes(32).toString("base64url");

async function markEmailResult(row: InvitationRow, ok: boolean, error: string | null): Promise<void> {
  const db = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const fresh = row.status === "CREATED" || row.status === "FAILED";
  // Koşullu güncelleme (tek ifade): arada müşteri açtıysa / yanıtladıysa durum geri alınmaz.
  const patch = ok
    ? fresh
      ? { status: "SENT", sent_at: nowIso, error: null }
      : { sent_at: nowIso, error: null }
    : fresh
      ? { status: "FAILED", error }
      : { error };
  const { error: updateError } = await db
    .from("crm_survey_invitations")
    .update(patch)
    .eq("id", row.id)
    .in("status", fresh ? ["CREATED", "FAILED"] : ["SENT", "OPENED"]);
  if (updateError) throw dbError(updateError);
}

/** Davet e-postası (Resend). Başarısızsa davet FAILED (kısa kodla) olur ve 502 MAIL_SEND_FAILED fırlatılır. */
async function deliverEmail(row: InvitationRow, survey: SurveyRow, origin: string, kind: "invite" | "reminder", idempotencyKey: string) {
  if (!row.email) throw new HttpError(422, "SURVEY_NO_CONTACT");
  const mail = buildSurveyEmail({
    name: row.recipient_name,
    link: buildSurveyLink(origin, row.token),
    title: survey.title,
    intro: survey.intro,
    kind,
  });
  const result = await sendMail({ to: row.email, ...mail, idempotencyKey });
  await markEmailResult(row, result.ok, result.ok ? null : result.error);
  if (!result.ok) {
    console.error(`[surveys] e-posta gönderilemedi: ${row.id} (${result.error})`);
    throw new HttpError(502, "MAIL_SEND_FAILED", undefined, result.error);
  }
}

/**
 * POST /api/crm/surveys/{id}/invitations. EMAIL: e-posta kapalıysa hiçbir şey yazılmadan 503 MAIL_NOT_CONFIGURED;
 * açıksa davet açılır ve e-posta hemen gönderilir (SENT / FAILED). WhatsApp / SMS / Link: yalnız link üretilir (CREATED),
 * personel mesajı kendi gönderip "Gönderdim" der. 7 gün içinde yanıtsız davet varsa o döner (`reused`), e-posta
 * tekrar gitmez.
 */
export async function createInvitation(
  surveyId: string,
  body: CreateInvitationValues,
  staff: StaffContext,
  origin: string
): Promise<CreatedSurveyInvitation> {
  const survey = await getSurveyRow(surveyId);
  if (body.channel === "EMAIL" && !isMailConfigured()) throw new HttpError(503, "MAIL_NOT_CONFIGURED");
  const r = await resolveRecipient(body.recipient);
  if (body.channel === "EMAIL" && !r.email) throw new HttpError(422, "SURVEY_NO_CONTACT");
  if ((body.channel === "WHATSAPP" || body.channel === "SMS") && !r.phone) throw new HttpError(422, "SURVEY_NO_CONTACT");

  const { data, error } = await getSupabaseAdminClient().rpc("crm_create_survey_invitation", {
    p_survey_id: surveyId,
    p_token: newToken(),
    p_lead_id: r.leadId,
    p_institution_id: r.institutionId,
    p_recipient_name: r.name,
    p_organization_name: r.organizationName,
    p_email: r.email,
    p_phone: r.phone,
    p_channel: body.channel,
    p_actor: staff.userId,
  });
  if (error) throw dbError(error);
  const { id, reused } = data as { id: string; reused: boolean };
  if (reused) return { ...(await invitationDto(id)), reused: true };

  await recordAudit(staff, {
    action: "SURVEY_INVITATION_CREATED",
    entityType: "survey_invitation",
    entityId: id,
    entityLabel: r.organizationName,
    details: { surveyId, channel: body.channel, leadId: r.leadId, institutionId: r.institutionId },
  });

  if (body.channel === "EMAIL") {
    await deliverEmail(await getInvitationRow(id), survey, origin, "invite", `survey-invite:${id}`);
    await recordAudit(staff, {
      action: "SURVEY_INVITATION_SENT",
      entityType: "survey_invitation",
      entityId: id,
      entityLabel: r.organizationName,
      details: { surveyId, channel: "EMAIL", leadId: r.leadId, institutionId: r.institutionId },
    });
  }
  return { ...(await invitationDto(id)), reused: false };
}

/**
 * POST /api/crm/surveys/invitations/{id}/sent — WhatsApp / SMS / Link davetini personel gönderdiğini işaretler
 * (CREATED → SENT). Zaten gönderilmiş / açılmış / yanıtlanmış / süresi dolmuş davette hiçbir şey değişmez (idempotent).
 * E-posta davetini sunucu işaretler (400).
 */
export async function markInvitationSent(id: string, staff: StaffContext): Promise<SurveyInvitation> {
  const row = await getInvitationRow(id);
  if (row.channel === "EMAIL") throw new HttpError(400, "VALIDATION");
  const status = effectiveStatus({ status: row.status, expiresAt: Date.parse(row.expires_at) }, Date.now());
  if (status === "CREATED") {
    const { data, error } = await getSupabaseAdminClient()
      .from("crm_survey_invitations")
      .update({ status: "SENT", sent_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "CREATED")
      .select("id");
    if (error) throw dbError(error);
    if (data?.length) {
      await recordAudit(staff, {
        action: "SURVEY_INVITATION_SENT",
        entityType: "survey_invitation",
        entityId: id,
        entityLabel: row.organization_name,
        details: { surveyId: row.survey_id, channel: row.channel, leadId: row.lead_id, institutionId: row.institution_id },
      });
    }
  }
  return invitationDto(id);
}

/**
 * POST /api/crm/surveys/invitations/{id}/resend — yalnız EMAIL davetinde; yanıtlanmış (409) ya da süresi dolmuş (410)
 * davet yeniden gönderilmez. Başarılıysa gönderim anı yenilenir (anket araması vadesi ileri kayar).
 */
export async function resendInvitation(id: string, staff: StaffContext, origin: string): Promise<SurveyInvitation> {
  const row = await getInvitationRow(id);
  if (row.channel !== "EMAIL") throw new HttpError(400, "VALIDATION");
  const status = effectiveStatus({ status: row.status, expiresAt: Date.parse(row.expires_at) }, Date.now());
  if (status === "RESPONDED") throw new HttpError(409, "SURVEY_ANSWERED");
  if (status === "EXPIRED") throw new HttpError(410, "SURVEY_EXPIRED");
  if (!isMailConfigured()) throw new HttpError(503, "MAIL_NOT_CONFIGURED");
  const survey = await getSurveyRow(row.survey_id);
  const kind = row.status === "SENT" || row.status === "OPENED" ? "reminder" : "invite";
  // Aynı dakikadaki ikinci tıklama ikinci e-posta göndermez (Resend Idempotency-Key).
  await deliverEmail(row, survey, origin, kind, `survey-resend:${id}:${Math.floor(Date.now() / 60_000)}`);
  await recordAudit(staff, {
    action: "SURVEY_INVITATION_RESENT",
    entityType: "survey_invitation",
    entityId: id,
    entityLabel: row.organization_name,
    details: { surveyId: row.survey_id, channel: "EMAIL", leadId: row.lead_id, institutionId: row.institution_id },
  });
  return invitationDto(id);
}
