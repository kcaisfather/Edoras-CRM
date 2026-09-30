import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { billingProfileCompleteness, effectiveBillingType } from "@/lib/domain/institutions/billing-profile";
import type { CreateInvoiceBody, InvoiceListQuery } from "@/lib/domain/invoices/schemas";
import {
  buildInvoiceRequestEmail,
  canRetryInvoice,
  computeVat,
  outcomeAfterMail,
  parseEmailList,
  saleRefOf,
} from "@/lib/domain/invoices/logic";
import {
  INVOICE_STATUSES,
  type EInvoiceType,
  type Invoice,
  type InvoiceList,
  type InvoiceMode,
  type InvoiceOptions,
  type InvoiceProviderCode,
  type InvoiceProviderInfo,
  type InvoiceStatus,
} from "@/lib/domain/invoices/types";
import { recordAudit } from "./audit";
import { fetchAll } from "./edoras";
import { CRM_COLUMNS, toProfile, type CrmRow } from "./institutions";
import { isMailConfigured, sendMail } from "./mail";
import { pgChain, type PgChain } from "./pg-chain";
import { staffNameMap } from "./staff";

/**
 * Faturalar (DeepSport madde 9 · INVOICES): crm_invoices. Yöntemler:
 *  - EMAIL: fatura talebi Resend ile muhasebeci adresine (env ACCOUNTANT_EMAIL) — ve istenirse müşterinin fatura
 *    e-postasına — gider; muhasebeci keser. Resend ya da adres yoksa 503 MAIL_NOT_CONFIGURED (satır açılmaz).
 *  - MANUAL: fatura başka yerde kesildi; numara + tarih kaydedilir (doğrudan ISSUED).
 *  - PROVIDER: sağlayıcı entegrasyonu (Paraşüt). Kimlik bilgisi yok → yapılandırılmamış (503 PROVIDER_NOT_CONFIGURED).
 *
 * KURAL: fatura yalnız fatura bilgisi (adres + TC/VKN) tam kuruma açılır — veritabanı zorlar (crm_guard_invoice,
 * CRM_BILLING_REQUIRED). E-posta / platform yöntemleri ayrıca tam fatura profili ister (unvan, il, ilçe, e-posta,
 * vergi dairesi): muhasebecinin kesebilmesi için.
 * `details` / işlem kaydına e-posta, adres, TC/VKN yazılmaz.
 */

// --- Sağlayıcı arayüzü ---------------------------------------------------------------------------

export interface ProviderIssueInput {
  invoiceId: string;
  customerName: string;
  net: number;
  vatRate: number;
  gross: number;
  description: string;
  issueDate: string;
}

export type ProviderIssueResult =
  | { ok: true; invoiceNo: string; pdfUrl?: string; type?: EInvoiceType }
  | { ok: false; error: string };

/**
 * Fatura sağlayıcısı arayüzü (DeepSport InvoiceProvider). Paraşüt: müşteri (GİB e-Fatura mükellefi sorgusu) → taslak →
 * resmileştirme (e-Fatura / e-Arşiv müşterinin kaydına göre) → PDF + fatura no.
 */
export interface InvoiceProvider {
  code: InvoiceProviderCode;
  name: string;
  isConfigured(): boolean;
  issue(input: ProviderIssueInput): Promise<ProviderIssueResult>;
}

/** Paraşüt ortam değişkenleri (hepsi dolu değilse yapılandırılmamış). */
const PARASUT_ENV = ["PARASUT_CLIENT_ID", "PARASUT_CLIENT_SECRET", "PARASUT_USERNAME", "PARASUT_PASSWORD", "PARASUT_COMPANY_ID"] as const;

const parasut: InvoiceProvider = {
  code: "PARASUT",
  name: "Paraşüt",
  isConfigured: () => PARASUT_ENV.every((name) => Boolean(process.env[name]?.trim())),
  // TODO(Paraşüt): gerçek istemci yazılmadı (kimlik bilgisi yok). Yapılacaklar: OAuth2 (password grant) → /contacts
  // (VKN/TCKN ile ara, yoksa oluştur; e-Fatura mükellefi sorgusu: /e_invoice_inboxes) → /sales_invoices (taslak,
  // açıklama + KDV) → /e_invoices ya da /e_archives (resmileştirme) → PDF adresi + fatura no. Başarısızlıkta
  // { ok: false, error: "parasut:<http durumu>" } (sağlayıcı gövdesi ve alıcı bilgisi döndürülmez).
  issue: async () => ({ ok: false, error: "parasut:not-implemented" }),
};

const PROVIDERS: Record<InvoiceProviderCode, InvoiceProvider | null> = { PARASUT: parasut, LOGO: null, OTHER: null };

function providerInfo(): InvoiceProviderInfo[] {
  return [{ code: "PARASUT", name: parasut.name, configured: parasut.isConfigured() }];
}

/** Muhasebeci adresi (env ACCOUNTANT_EMAIL, isteğe bağlı): geçerli e-posta değilse yok sayılır. */
function accountantEmail(): string | null {
  const value = process.env.ACCOUNTANT_EMAIL?.trim();
  return value ? (parseEmailList(value).valid[0] ?? null) : null;
}

function emailAvailable(): boolean {
  return isMailConfigured() && accountantEmail() != null;
}

export function getInvoiceOptions(): InvoiceOptions {
  return { providers: providerInfo(), emailAvailable: emailAvailable() };
}

// --- Satırlar ------------------------------------------------------------------------------------

const INVOICE_COLUMNS =
  "id, institution_id, payment_id, license_id, customer_name, mode, provider, type, recipient_emails, amount, net_amount, vat_rate, vat_amount, currency, description, issue_date, status, invoice_no, pdf_url, error, attempts, note, created_at, issued_at, created_by";

interface InvoiceRow {
  id: string;
  institution_id: string;
  payment_id: string | null;
  license_id: string | null;
  customer_name: string;
  mode: InvoiceMode;
  provider: InvoiceProviderCode | null;
  type: EInvoiceType | null;
  recipient_emails: string[];
  amount: number | string;
  net_amount: number | string;
  vat_rate: number | string;
  vat_amount: number | string;
  currency: "TRY";
  description: string;
  issue_date: string;
  status: InvoiceStatus;
  invoice_no: string | null;
  pdf_url: string | null;
  error: string | null;
  attempts: number;
  note: string | null;
  created_at: string;
  issued_at: string | null;
  created_by: string | null;
}

function toInvoice(row: InvoiceRow, names: Map<string, string>): Invoice {
  return {
    id: row.id,
    institutionId: row.institution_id,
    paymentId: row.payment_id,
    licenseId: row.license_id,
    customerName: row.customer_name,
    mode: row.mode,
    provider: row.provider,
    type: row.type,
    recipientEmails: row.recipient_emails ?? [],
    amount: Number(row.amount),
    netAmount: Number(row.net_amount),
    vatRate: Number(row.vat_rate),
    vatAmount: Number(row.vat_amount),
    currency: row.currency,
    description: row.description,
    issueDate: row.issue_date,
    status: row.status,
    invoiceNo: row.invoice_no,
    pdfUrl: row.pdf_url,
    error: row.error,
    attempts: row.attempts,
    note: row.note,
    createdAt: row.created_at,
    issuedAt: row.issued_at,
    createdByName: row.created_by ? (names.get(row.created_by) ?? null) : null,
  };
}

async function loadInvoice(id: string): Promise<InvoiceRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_invoices").select(INVOICE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return data as unknown as InvoiceRow;
}

async function loadCrmRow(institutionId: string): Promise<CrmRow> {
  const { data, error } = await getSupabaseAdminClient().from("crm_institutions").select(CRM_COLUMNS).eq("institution_id", institutionId).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_ENROLLED");
  return data as unknown as CrmRow;
}

// --- Okuma ---------------------------------------------------------------------------------------

export async function listInvoices(query: InvoiceListQuery): Promise<InvoiceList> {
  const db = getSupabaseAdminClient();

  // Durum filtresi hariç aynı süzgeçler (sekme rozetleri için).
  const scoped = (q: unknown): PgChain => {
    let out = pgChain(q);
    if (query.institutionId) out = out.eq("institution_id", query.institutionId);
    if (query.from) out = out.gte("issue_date", query.from);
    if (query.to) out = out.lte("issue_date", query.to);
    if (query.saleRef) out = out.eq(query.saleRef.kind === "payment" ? "payment_id" : "license_id", query.saleRef.id);
    return out;
  };

  const from = query.page * query.size;
  let listQuery = scoped(db.from("crm_invoices").select(INVOICE_COLUMNS, { count: "exact" }));
  if (query.status) listQuery = listQuery.eq("status", query.status);
  const [page, statuses, names] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).order("id").range(from, from + query.size - 1),
    fetchAll<{ status: InvoiceStatus }>((a, b) =>
      scoped(db.from("crm_invoices").select("status")).order("id").range(a, b) as unknown as PromiseLike<{
        data: { status: InvoiceStatus }[] | null;
        error: { code?: string; message?: string } | null;
      }>
    ),
    staffNameMap(),
  ]);
  if (page.error) throw dbError(page.error);

  const counts = Object.fromEntries(INVOICE_STATUSES.map((s) => [s, 0])) as Record<InvoiceStatus, number>;
  for (const r of statuses) counts[r.status] += 1;

  return {
    items: ((page.data ?? []) as unknown as InvoiceRow[]).map((row) => toInvoice(row, names)),
    total: page.count ?? 0,
    page: query.page,
    size: query.size,
    counts,
  };
}

// --- Yazma ---------------------------------------------------------------------------------------

/** Kısa, kişisel veri içermeyen ayrıntı (işlem kaydı). */
const auditDetails = (row: Pick<InvoiceRow, "mode" | "amount" | "status">, extra: Record<string, string | number | boolean | null> = {}) => ({
  mode: row.mode,
  amount: Number(row.amount),
  status: row.status,
  ...extra,
});

/** Aynı Idempotency-Key ile gelen ikinci istek yeni satır açmaz, var olanı döndürür. */
async function findByKey(key: string): Promise<InvoiceRow | null> {
  const { data, error } = await getSupabaseAdminClient().from("crm_invoices").select(INVOICE_COLUMNS).eq("idempotency_key", key).maybeSingle();
  if (error) throw dbError(error);
  return (data as unknown as InvoiceRow | null) ?? null;
}

export interface CreateInvoiceResult {
  invoice: Invoice;
  /** Aynı anahtarla var olan fatura döndü (yeni satır açılmadı). */
  replayed: boolean;
}

/**
 * Fatura açar. Sıra: idempotency → kurum + profil denetimi → yöntem hazır mı (503) → satır (DB kuralları) → yöntem
 * (e-posta gönderimi / elle kayıt / sağlayıcı) → son durum. E-posta gönderilemezse satır FAILED + hata koduyla kalır;
 * `retryInvoice` yalnız bunu yeniden dener.
 */
export async function createInvoice(input: CreateInvoiceBody, idempotencyKey: string, staff: StaffContext): Promise<CreateInvoiceResult> {
  const names = await staffNameMap();

  const existing = await findByKey(idempotencyKey);
  if (existing) {
    if (existing.institution_id !== input.institutionId) throw new HttpError(409, "VALIDATION");
    return { invoice: toInvoice(existing, names), replayed: true };
  }

  const crm = await loadCrmRow(input.institutionId);
  const profile = toProfile(crm);
  const completeness = billingProfileCompleteness(profile);
  const provider = input.mode === "PROVIDER" ? PROVIDERS[input.provider ?? "PARASUT"] : null;

  if (input.mode === "EMAIL" && !emailAvailable()) throw new HttpError(503, "MAIL_NOT_CONFIGURED");
  if (input.mode === "PROVIDER" && !provider?.isConfigured()) throw new HttpError(503, "PROVIDER_NOT_CONFIGURED");
  // Elle kayıt başka yerde kesilmiş faturanın kaydıdır: yalnız veritabanı kuralı (adres + TC/VKN) aranır.
  if (input.mode !== "MANUAL" && !completeness.complete) throw new HttpError(422, "BILLING_PROFILE_INCOMPLETE");

  // Ödeme seçildiyse lisansı ondan al (aynı satış); ödeme başka kuruma aitse veritabanı reddeder (VALIDATION).
  let licenseId = input.licenseId ?? null;
  if (input.paymentId && !licenseId) {
    const { data, error } = await getSupabaseAdminClient().from("crm_payments").select("license_id").eq("id", input.paymentId).maybeSingle();
    if (error) throw dbError(error);
    licenseId = (data?.license_id as string | null | undefined) ?? null;
  }

  const vat = computeVat(input.amount, input.vatRate, input.vatIncluded);
  const customerName = profile.legalName?.trim() || crm.institution_name;
  const recipients =
    input.mode === "EMAIL" ? [accountantEmail() as string, ...(input.copyCustomer && profile.email ? [profile.email] : [])] : [];
  const manual = input.mode === "MANUAL";

  const { data, error } = await getSupabaseAdminClient()
    .from("crm_invoices")
    .insert({
      institution_id: input.institutionId,
      payment_id: input.paymentId ?? null,
      license_id: licenseId,
      customer_name: customerName,
      mode: input.mode,
      provider: input.mode === "PROVIDER" ? (input.provider ?? "PARASUT") : null,
      recipient_emails: recipients,
      amount: vat.gross,
      net_amount: vat.net,
      vat_rate: input.vatRate,
      vat_amount: vat.vat,
      description: input.description,
      issue_date: input.issueDate,
      status: manual ? "ISSUED" : "PENDING",
      invoice_no: manual ? input.invoiceNo : null,
      issued_at: manual ? new Date(`${input.issueDate}T00:00:00+03:00`).toISOString() : null,
      attempts: 0,
      note: input.note || null,
      idempotency_key: idempotencyKey,
      created_by: staff.userId,
    })
    .select(INVOICE_COLUMNS)
    .single();
  if (error) {
    // Eşzamanlı çift istek: kazanan satır zaten var.
    if (error.code === "23505" && /crm_invoices_idempotency_key_key/.test(error.message ?? "")) {
      const winner = await findByKey(idempotencyKey);
      if (winner) return { invoice: toInvoice(winner, names), replayed: true };
    }
    throw dbError(error);
  }
  let row = data as unknown as InvoiceRow;

  const ref = row.payment_id ? saleRefOf({ kind: "payment", id: row.payment_id }) : saleRefOf({ kind: "license", id: row.license_id as string });
  await recordAudit(staff, {
    action: "INVOICE_CREATED",
    entityType: "invoice",
    entityId: row.id,
    entityLabel: crm.institution_name,
    details: auditDetails(row, { saleRef: ref, institutionId: row.institution_id }),
  });

  if (manual) {
    await recordAudit(staff, { action: "INVOICE_ISSUED", entityType: "invoice", entityId: row.id, entityLabel: crm.institution_name, details: auditDetails(row) });
  } else {
    row = await deliver(row, crm, profile, staff);
  }
  return { invoice: toInvoice(row, names), replayed: false };
}

type Profile = ReturnType<typeof toProfile>;

/** EMAIL / PROVIDER yöntemini çalıştırır, son durumu yazar ve işlem kaydına düşer. Hata fırlatmaz (FAILED olarak kalır). */
async function deliver(row: InvoiceRow, crm: CrmRow, profile: Profile, staff: StaffContext): Promise<InvoiceRow> {
  const db = getSupabaseAdminClient();
  const attemptsBefore = row.attempts;
  let update: Record<string, unknown>;

  if (row.mode === "EMAIL") {
    const taxNumber = effectiveBillingType(profile) === "COMPANY" ? profile.taxNo : profile.tcNo;
    const mail = buildInvoiceRequestEmail({
      customerName: crm.institution_name,
      billing: {
        type: effectiveBillingType(profile),
        legalName: profile.legalName,
        taxNumber,
        taxOffice: profile.taxOffice,
        address: profile.address,
        district: profile.district,
        city: profile.city,
        email: profile.email,
      },
      description: row.description,
      net: Number(row.net_amount),
      vatRate: Number(row.vat_rate),
      vat: Number(row.vat_amount),
      gross: Number(row.amount),
      issueDate: row.issue_date,
      note: row.note,
    });

    // Muhasebeci zorunlu: başarısızsa satır FAILED. Müşteri kopyası nezaket kopyasıdır; gitmezse alıcı listesinden düşülür.
    const [accountant, ...copies] = row.recipient_emails;
    const attempt = attemptsBefore + 1;
    const first = await sendMail({ to: accountant, ...mail, idempotencyKey: `inv-${row.id}-${attempt}-0` });
    // Muhasebeciye gitmediyse alıcı listesi olduğu gibi kalır (yeniden denemede müşteri kopyası da gider).
    const delivered = first.ok ? [accountant] : [...row.recipient_emails];
    if (first.ok) {
      for (const [i, to] of copies.entries()) {
        const res = await sendMail({ to, ...mail, idempotencyKey: `inv-${row.id}-${attempt}-${i + 1}` });
        if (res.ok) delivered.push(to);
      }
    }
    update = { ...outcomeAfterMail(attemptsBefore, first.ok ? { ok: true } : { ok: false, error: first.error }), recipient_emails: delivered };
  } else {
    const provider = PROVIDERS[row.provider ?? "PARASUT"];
    const result: ProviderIssueResult = provider
      ? await provider.issue({
          invoiceId: row.id,
          customerName: row.customer_name,
          net: Number(row.net_amount),
          vatRate: Number(row.vat_rate),
          gross: Number(row.amount),
          description: row.description,
          issueDate: row.issue_date,
        })
      : { ok: false, error: "provider:not-configured" };
    update = result.ok
      ? { status: "ISSUED", error: null, attempts: attemptsBefore + 1, invoice_no: result.invoiceNo, pdf_url: result.pdfUrl ?? null, type: result.type ?? null, issued_at: new Date().toISOString() }
      : { status: "FAILED", error: result.error.slice(0, 200), attempts: attemptsBefore + 1 };
  }

  const { data, error } = await db.from("crm_invoices").update(update).eq("id", row.id).select(INVOICE_COLUMNS).single();
  if (error) throw dbError(error);
  const updated = data as unknown as InvoiceRow;

  await recordAudit(staff, {
    action: updated.status === "FAILED" ? "INVOICE_FAILED" : "INVOICE_ISSUED",
    entityType: "invoice",
    entityId: updated.id,
    entityLabel: crm.institution_name,
    details: auditDetails(updated, { attempts: updated.attempts, ...(updated.error ? { error: updated.error } : {}) }),
  });
  return updated;
}

/**
 * Başarısız faturayı yeniden dener (yalnız FAILED; elle kayıt hiç başarısız olmaz). Satır önce koşullu güncellemeyle
 * PENDING'e alınır: iki eşzamanlı istekten yalnız biri gönderim yapar (çift e-posta olmaz).
 */
export async function retryInvoice(id: string, staff: StaffContext): Promise<Invoice> {
  const current = await loadInvoice(id);
  if (!canRetryInvoice({ status: current.status, mode: current.mode })) throw new HttpError(409, "INVOICE_NOT_RETRYABLE");

  if (current.mode === "EMAIL" && !emailAvailable()) throw new HttpError(503, "MAIL_NOT_CONFIGURED");
  if (current.mode === "PROVIDER" && !PROVIDERS[current.provider ?? "PARASUT"]?.isConfigured()) throw new HttpError(503, "PROVIDER_NOT_CONFIGURED");

  const crm = await loadCrmRow(current.institution_id);
  const profile = toProfile(crm);
  if (!billingProfileCompleteness(profile).complete) throw new HttpError(422, "BILLING_PROFILE_INCOMPLETE");

  // E-posta yeniden denemesi, kayıtlı alıcıların yerine güncel muhasebeci adresini kullanır (adres değişmiş olabilir).
  const recipients =
    current.mode === "EMAIL"
      ? [accountantEmail() as string, ...current.recipient_emails.filter((e) => e !== accountantEmail() && e === profile.email)]
      : current.recipient_emails;

  const { data: claimed, error } = await getSupabaseAdminClient()
    .from("crm_invoices")
    .update({ status: "PENDING", error: null, recipient_emails: recipients })
    .eq("id", id)
    .eq("status", "FAILED")
    .select(INVOICE_COLUMNS);
  if (error) throw dbError(error);
  if (!claimed?.length) throw new HttpError(409, "INVOICE_NOT_RETRYABLE");

  await recordAudit(staff, {
    action: "INVOICE_RETRIED",
    entityType: "invoice",
    entityId: id,
    entityLabel: crm.institution_name,
    details: { mode: current.mode, attempts: current.attempts },
  });

  const row = await deliver(claimed[0] as unknown as InvoiceRow, crm, profile, staff);
  return toInvoice(row, await staffNameMap());
}
