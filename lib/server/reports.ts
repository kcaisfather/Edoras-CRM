import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { APP_URL } from "@/lib/env";
import { addDays, todayIso } from "@/lib/domain/institutions/rules";
import { buildReportSections, type ReportSourceData } from "@/lib/domain/reports/build";
import { periodLabel, renderReportHtml, renderReportText, reportSubject } from "@/lib/domain/reports/render";
import { nextRunAt } from "@/lib/domain/reports/schedule";
import type { ReportSubscriptionInput } from "@/lib/domain/reports/schemas";
import {
  periodDaysFor,
  type ReportFrequency,
  type ReportPreview,
  type ReportRunStatus,
  type ReportSection,
  type ReportSendResult,
  type ReportSubscriptionDto,
} from "@/lib/domain/reports/types";
import type { PanelRole } from "@/lib/domain/auth/types";
import { recordAudit, recordSystemAudit } from "./audit";
import { listOpenTasksForReport } from "./crm-tasks";
import { fetchAll } from "./edoras";
import { listInstitutions } from "./institutions";
import { isMailConfigured, sendMail } from "./mail";
import { listStaff, staffNameMap } from "./staff";

/**
 * Raporlar (Madde 10): abonelikler (crm_report_subscriptions), gönderim kaydı (crm_report_runs), rapor üretimi ve
 * dağıtıcı. Zamanlayıcı altyapısı yoktur; dağıtıcı POST /api/cron/reports ile dışarıdan tetiklenir (CRON_SECRET).
 *
 * GÜVENLİK
 * - Alıcılar yalnız aktif CRM personelidir (recipient_ids). E-posta adresi gönderim anında Auth'tan çözülür; serbest
 *   adres yoktur, kapatılan personele gönderilmez.
 * - HER alıcıya AYRI e-posta gider ve içerik alıcının rolüne göre üretilir (lib/domain/reports/build.ts): CRM_AGENT'a
 *   tutar, toplam ve `salesTotal` bölümü hiç konmaz; atanmış görev yalnız atanana (ADMIN hepsini) gider.
 * - Kaynak veri (görev, aday, kurum, tahsilat) alıcı sayısından bağımsız BİR kez yüklenir.
 * - Yanıt ve işlem kaydında alıcı adresi yoktur; yalnız sayılar. Sağlayıcı hata metni yazılmaz (kısa kod).
 *
 * İDEMPOTENS (dağıtıcı): abonelik "talep edilir" — `UPDATE … SET next_run_at = yeni WHERE id AND active AND next_run_at =
 * eski` — ve yalnız satırı güncelleyen çağrı gönderir. İki eşzamanlı dağıtıcıdan biri 0 satır görür ve atlar. Talep
 * gönderimden ÖNCE yapıldığı için çökme durumunda o çalışma kaybolur ama ASLA iki kez gitmez (en fazla bir kez).
 * Ek olarak Resend `Idempotency-Key` (abonelik + çalışma zamanı + alıcı) kullanılır.
 */

const SUB_COLUMNS =
  "id, name, recipient_ids, frequency, time, weekday, day_of_month, sections, timezone, active, last_sent_at, next_run_at, created_by, created_at";

interface SubRow {
  id: string;
  name: string;
  recipient_ids: string[];
  frequency: ReportFrequency;
  time: string;
  weekday: number | null;
  day_of_month: number | null;
  sections: ReportSection[];
  timezone: "Europe/Istanbul";
  active: boolean;
  last_sent_at: string | null;
  next_run_at: string;
  created_by: string | null;
  created_at: string;
}

interface RunRow {
  subscription_id: string;
  run_at: string;
  trigger: "CRON" | "MANUAL";
  sent_to_count: number;
  status: ReportRunStatus;
}

const ms = (v: string | null): number | null => (v == null ? null : Date.parse(v));

function toDto(row: SubRow, names: Map<string, string>, lastRun: RunRow | undefined): ReportSubscriptionDto {
  return {
    id: row.id,
    name: row.name,
    recipientIds: row.recipient_ids,
    frequency: row.frequency,
    time: row.time,
    weekday: row.weekday,
    dayOfMonth: row.day_of_month,
    sections: row.sections,
    timezone: row.timezone,
    active: row.active,
    lastSentAt: ms(row.last_sent_at),
    nextRunAt: Date.parse(row.next_run_at),
    createdByName: row.created_by ? (names.get(row.created_by) ?? null) : null,
    createdAt: Date.parse(row.created_at),
    lastRun: lastRun
      ? { at: Date.parse(lastRun.run_at), status: lastRun.status, sentTo: lastRun.sent_to_count, manual: lastRun.trigger === "MANUAL" }
      : null,
  };
}

/** Her abonelik için en son deneme (son 500 kayıttan; abonelik sayısı küçüktür). */
async function lastRuns(): Promise<Map<string, RunRow>> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_report_runs")
    .select("subscription_id, run_at, trigger, sent_to_count, status")
    .order("run_at", { ascending: false })
    .limit(500);
  if (error) throw dbError(error);
  const out = new Map<string, RunRow>();
  for (const r of (data ?? []) as RunRow[]) if (!out.has(r.subscription_id)) out.set(r.subscription_id, r);
  return out;
}

async function getRow(id: string): Promise<SubRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_report_subscriptions").select(SUB_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as unknown as SubRow;
}

async function dto(row: SubRow): Promise<ReportSubscriptionDto> {
  const [names, runs] = await Promise.all([staffNameMap(), lastRuns()]);
  return toDto(row, names, runs.get(row.id));
}

const auditDetails = (s: Pick<SubRow, "frequency" | "time" | "recipient_ids" | "sections" | "active">) => ({
  frequency: s.frequency,
  time: s.time,
  recipients: s.recipient_ids.length,
  sections: s.sections.length,
  active: s.active,
});

// --- Abonelikler (yalnız ADMIN — uçlar denetler) ---------------------------------------------------

export async function listSubscriptions(): Promise<ReportSubscriptionDto[]> {
  const { data, error } = await getSupabaseAdminClient().from("crm_report_subscriptions").select(SUB_COLUMNS).order("created_at");
  if (error) throw dbError(error);
  const [names, runs] = await Promise.all([staffNameMap(), lastRuns()]);
  return ((data ?? []) as unknown as SubRow[]).map((r) => toDto(r, names, runs.get(r.id)));
}

function columns(input: ReportSubscriptionInput, now: Date) {
  const next = nextRunAt(input, now);
  if (next == null) throw new HttpError(400, "VALIDATION");
  return {
    name: input.name,
    recipient_ids: input.recipientIds,
    frequency: input.frequency,
    time: input.time,
    weekday: input.weekday ?? null,
    day_of_month: input.dayOfMonth ?? null,
    sections: input.sections,
    timezone: "Europe/Istanbul",
    active: input.active,
    next_run_at: new Date(next).toISOString(),
  };
}

export async function createSubscription(input: ReportSubscriptionInput, staff: StaffContext): Promise<ReportSubscriptionDto> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_report_subscriptions")
    .insert({ ...columns(input, new Date()), created_by: staff.userId })
    .select(SUB_COLUMNS)
    .single();
  if (error) throw dbError(error);
  const row = data as unknown as SubRow;
  await recordAudit(staff, {
    action: "REPORT_SUBSCRIPTION_CREATED",
    entityType: "report_subscription",
    entityId: row.id,
    entityLabel: row.name,
    details: auditDetails(row),
  });
  return dto(row);
}

export async function updateSubscription(id: string, input: ReportSubscriptionInput, staff: StaffContext): Promise<ReportSubscriptionDto> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_report_subscriptions")
    .update(columns(input, new Date()))
    .eq("id", id)
    .select(SUB_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const row = data as unknown as SubRow;
  await recordAudit(staff, {
    action: "REPORT_SUBSCRIPTION_UPDATED",
    entityType: "report_subscription",
    entityId: row.id,
    entityLabel: row.name,
    details: auditDetails(row),
  });
  return dto(row);
}

export async function deleteSubscription(id: string, staff: StaffContext): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().from("crm_report_subscriptions").delete().eq("id", id).select("id, name").maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  await recordAudit(staff, { action: "REPORT_SUBSCRIPTION_DELETED", entityType: "report_subscription", entityId: id, entityLabel: (data as { name: string }).name });
}

// --- Rapor kaynağı ---------------------------------------------------------------------------------

const LEAD_REPORT_COLUMNS =
  "id, status, organization_name, contact_first_name, contact_last_name, contact_email, contact_phone, offer_amount, sale_amount, institution_id";
const MAX_PERIOD_DAYS = 30;

interface LeadReportRow {
  id: string;
  status: ReportSourceData["leads"][number]["status"];
  organization_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  offer_amount: number | string | null;
  sale_amount: number | string | null;
  institution_id: string | null;
}

/**
 * Raporun ham verisi (alıcıdan bağımsız, tutarlar DOLU): süzme `buildReportSections`'ta alıcı rolüne göre yapılır, bu
 * nesne hiçbir zaman istemciye ya da e-postaya olduğu gibi gitmez.
 */
async function loadSource(): Promise<ReportSourceData> {
  const db = getSupabaseAdminClient();
  const paymentsFrom = addDays(todayIso(), -MAX_PERIOD_DAYS);
  const [tasks, leadRows, institutions, payments] = await Promise.all([
    listOpenTasksForReport(),
    fetchAll<LeadReportRow>((a, b) => db.from("crm_leads").select(LEAD_REPORT_COLUMNS).order("id").range(a, b)),
    listInstitutions(),
    fetchAll<{ institution_id: string; amount: number | string; paid_on: string }>((a, b) =>
      db.from("crm_payments").select("institution_id, amount, paid_on").gte("paid_on", paymentsFrom).order("id").range(a, b)
    ),
  ]);
  return {
    tasks,
    leads: leadRows.map((l) => ({
      id: l.id,
      status: l.status,
      organizationName: l.organization_name,
      contactFirstName: l.contact_first_name,
      contactLastName: l.contact_last_name,
      contactEmail: l.contact_email,
      contactPhone: l.contact_phone,
      offerAmount: l.offer_amount == null ? null : Number(l.offer_amount),
      saleAmount: l.sale_amount == null ? null : Number(l.sale_amount),
      institutionId: l.institution_id,
    })),
    institutions,
    payments: payments.map((p) => ({ institutionId: p.institution_id, amount: Number(p.amount), paidOn: p.paid_on })),
  };
}

const viewerOf = (userId: string, role: PanelRole) => ({ id: userId, isAdmin: role === "ADMIN" });

/** Panel önizlemesi: çağıranın rolüne göre süzülmüş, e-postadakiyle aynı içerik. */
export async function previewReport(staff: StaffContext, sections: ReportSection[], frequency: ReportFrequency): Promise<ReportPreview> {
  const now = new Date();
  const viewer = viewerOf(staff.userId, staff.role);
  const built = buildReportSections(await loadSource(), sections, viewer, { periodDays: periodDaysFor(frequency), now });
  return { generatedAt: now.getTime(), period: periodLabel(frequency), sections: built, text: renderReportText(built, frequency, now, APP_URL || null) };
}

// --- Gönderim --------------------------------------------------------------------------------------

interface Recipient {
  id: string;
  email: string;
  role: PanelRole;
}

/** Abonelik alıcılarını şimdiki ekipten çözer: yalnız aktif personel ve e-postası olan. */
async function resolveRecipients(ids: readonly string[]): Promise<Recipient[]> {
  const wanted = new Set(ids);
  return (await listStaff())
    .filter((m) => wanted.has(m.id) && m.status === "ACTIVE" && m.email)
    .map((m) => ({ id: m.id, email: m.email, role: m.role }));
}

interface SendOutcome {
  status: ReportRunStatus;
  sentTo: number;
  failed: number;
  error: string | null;
}

/** Her alıcıya kendi rolüne göre üretilmiş rapor. `keyBase` Resend idempotency anahtarının kökü. */
async function sendToRecipients(row: SubRow, keyBase: string, now: Date): Promise<SendOutcome> {
  const recipients = await resolveRecipients(row.recipient_ids);
  if (recipients.length === 0) return { status: "SKIPPED", sentTo: 0, failed: 0, error: "no-recipients" };

  const source = await loadSource();
  const periodDays = periodDaysFor(row.frequency);
  const subject = reportSubject(row.frequency, now);
  let sentTo = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const r of recipients) {
    const sections = buildReportSections(source, row.sections, viewerOf(r.id, r.role), { periodDays, now });
    const result = await sendMail({
      to: r.email,
      subject,
      text: renderReportText(sections, row.frequency, now, APP_URL || null),
      html: renderReportHtml(sections, row.frequency, now, APP_URL || null),
      idempotencyKey: `${keyBase}:${r.id}`,
    });
    if (result.ok) sentTo++;
    else {
      failed++;
      firstError ??= result.error;
    }
  }
  if (sentTo === 0) return { status: "FAILED", sentTo, failed, error: firstError ?? "send-failed" };
  return { status: "SENT", sentTo, failed, error: failed > 0 ? `failed:${failed}/${recipients.length}` : null };
}

async function recordRun(subscriptionId: string, trigger: "CRON" | "MANUAL", outcome: SendOutcome): Promise<void> {
  const db = getSupabaseAdminClient();
  const { error } = await db.from("crm_report_runs").insert({
    subscription_id: subscriptionId,
    trigger,
    sent_to_count: outcome.sentTo,
    status: outcome.status,
    error: outcome.error,
  });
  if (error) console.error(`[reports] gönderim kaydı yazılamadı (${error.code ?? "?"})`);
  if (outcome.sentTo > 0) {
    const { error: e2 } = await db.from("crm_report_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", subscriptionId);
    if (e2) console.error(`[reports] last_sent_at yazılamadı (${e2.code ?? "?"})`);
  }
}

/** "Şimdi gönder" art arda basılmasın (kaydedilmiş alıcılara gerçek e-posta gider). */
const SEND_NOW_COOLDOWN_MS = 60_000;

/**
 * POST /api/reports/subscriptions/{id}/send-now (ADMIN). Zamanlamayı değiştirmez. E-posta ayarlı değilse 503
 * MAIL_NOT_CONFIGURED; alıcıların hiçbirine gitmediyse 502 MAIL_SEND_FAILED (kayıt yine yazılır). Yanıtta adres yok.
 */
export async function sendSubscriptionNow(id: string, staff: StaffContext): Promise<ReportSendResult> {
  if (!isMailConfigured()) throw new HttpError(503, "MAIL_NOT_CONFIGURED");
  const row = await getRow(id);

  const since = new Date(Date.now() - SEND_NOW_COOLDOWN_MS).toISOString();
  const { count, error } = await getSupabaseAdminClient()
    .from("crm_report_runs")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", id)
    .eq("trigger", "MANUAL")
    .gte("run_at", since);
  if (error) throw dbError(error);
  if ((count ?? 0) > 0) throw new HttpError(429, "RATE_LIMITED");

  const now = new Date();
  const outcome = await sendToRecipients(row, `report-now:${id}:${Math.floor(now.getTime() / 60_000)}`, now);
  await recordRun(id, "MANUAL", outcome);
  await recordAudit(staff, {
    action: "REPORT_SENT",
    entityType: "report_subscription",
    entityId: id,
    entityLabel: row.name,
    details: { trigger: "MANUAL", sentTo: outcome.sentTo, failed: outcome.failed, status: outcome.status },
  });
  if (outcome.status === "FAILED") throw new HttpError(502, "MAIL_SEND_FAILED", undefined, outcome.error ?? undefined);
  if (outcome.status === "SKIPPED") throw new HttpError(422, "REPORT_RECIPIENT_INVALID");
  return { sentTo: outcome.sentTo, failed: outcome.failed, sentAt: now.getTime() };
}

// --- Dağıtıcı --------------------------------------------------------------------------------------

export interface DispatchResult {
  /** Çalışma zamanı gelmiş aktif abonelik sayısı (bu çağrının gördüğü). */
  due: number;
  /** Bu çağrının talep edip işlediği abonelik. */
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Başka bir dağıtıcı önce talep etti. */
  claimedElsewhere: number;
  /** Süre bütçesi bitti; kalanlar bir sonraki tetiklemeye kaldı. */
  deferred: number;
}

const MAX_DUE_PER_RUN = 50;
/** Sunucusuz çalışma süresi sınırına (varsayılan 60 sn) takılmamak için yeni abonelik başlatma süresi. */
const TIME_BUDGET_MS = 40_000;

/**
 * Çalışma zamanı gelmiş (next_run_at ≤ now) aktif abonelikleri gönderir. Çağıran: POST /api/cron/reports (CRON_SECRET
 * kapısı ve e-posta ayarı orada denetlenir). İdempotenstir: aynı anda / art arda çağrılsa da bir çalışma bir kez gider.
 * Kaçırılan çalışmalar birikmez: bir sonraki zaman `now`'dan hesaplanır (kesinti sonrası tek e-posta).
 */
export async function dispatchDueReports(now: Date = new Date()): Promise<DispatchResult> {
  const db = getSupabaseAdminClient();
  const started = Date.now();
  const result: DispatchResult = { due: 0, processed: 0, sent: 0, failed: 0, skipped: 0, claimedElsewhere: 0, deferred: 0 };

  const { data, error } = await db
    .from("crm_report_subscriptions")
    .select(SUB_COLUMNS)
    .eq("active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at")
    .limit(MAX_DUE_PER_RUN);
  if (error) throw dbError(error);
  const due = (data ?? []) as unknown as SubRow[];
  result.due = due.length;

  for (const row of due) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      result.deferred++;
      continue;
    }
    // Talep: yalnız next_run_at hâlâ okuduğumuz değerse güncellenir → tek kazanan.
    const next = nextRunAt({ frequency: row.frequency, time: row.time, weekday: row.weekday, dayOfMonth: row.day_of_month }, now);
    const nextIso = new Date(next ?? now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: claimed, error: claimError } = await db
      .from("crm_report_subscriptions")
      .update({ next_run_at: nextIso })
      .eq("id", row.id)
      .eq("active", true)
      .eq("next_run_at", row.next_run_at)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error(`[reports] talep başarısız (${claimError.code ?? "?"})`);
      result.failed++;
      continue;
    }
    if (!claimed) {
      result.claimedElsewhere++;
      continue;
    }

    result.processed++;
    let outcome: SendOutcome;
    try {
      outcome = await sendToRecipients(row, `report:${row.id}:${Date.parse(row.next_run_at)}`, now);
    } catch (err) {
      // Kaynak veri okunamadı (Edoras / CRM); ayrıntı (kişisel veri olabilir) loglanmaz.
      outcome = { status: "FAILED", sentTo: 0, failed: 0, error: err instanceof HttpError ? `http:${err.code}` : "source-failed" };
    }
    await recordRun(row.id, "CRON", outcome);
    await recordSystemAudit({
      action: "REPORT_SENT",
      entityType: "report_subscription",
      entityId: row.id,
      entityLabel: row.name,
      details: { trigger: "CRON", sentTo: outcome.sentTo, failed: outcome.failed, status: outcome.status },
    });
    if (outcome.status === "SENT") result.sent++;
    else if (outcome.status === "FAILED") result.failed++;
    else result.skipped++;
  }
  return result;
}
