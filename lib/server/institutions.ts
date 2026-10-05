import "server-only";

import { randomInt } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { EDORAS_PANEL_URL } from "@/lib/env";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { billingProfileCompleteness } from "@/lib/domain/institutions/billing-profile";
import {
  generateTemporaryPassword,
  initialAcademicPeriod,
  isBillingComplete,
  todayIso,
} from "@/lib/domain/institutions/rules";
import {
  toBilling,
  toBillingProfile,
  toContact,
  toLicense,
  toPayment,
  type BillingInput,
  type ContactInput,
  type ConvertInput,
  type EnrollInput,
  type NewDemoInput,
  type PaymentInput,
} from "@/lib/domain/institutions/schemas";
import type {
  BillingProfile,
  BillingType,
  CrmRecord,
  DemoCredentials,
  InstitutionDetail,
  InstitutionListItem,
  License,
  Payment,
  PaymentMethod,
} from "@/lib/domain/institutions/types";
import { recordAudit } from "./audit";
import { createCompensator } from "./compensation";
import { internalInstitutionIds } from "./internal-institutions";
import {
  createEdorasDemo,
  fetchAll,
  getEdorasInstitution,
  getEdorasInstitutionExtras,
  isEdorasEmailTaken,
  isEdorasInstitutionNameTaken,
  listEdorasInstitutions,
  type EdorasInstitution,
} from "./edoras";

/**
 * Kurum servisi — iki veritabanını birleştirir: kurumlar Edoras'tan (lib/server/edoras.ts), CRM kaydı,
 * lisans ve ödeme CRM projesinden (getSupabaseAdminClient). CRM kaydı olup Edoras'ta bulunmayan kurum
 * (silinmiş) listeden düşmez: mali kayıt kaybolmasın diye "Edoras'ta yok" olarak görünür.
 */

// --- CRM satırları ------------------------------------------------------------------------------

export const CRM_COLUMNS =
  "institution_id, institution_name, status, contact_name, contact_phone, contact_email, address, tc_no, tax_no, billing_type, legal_name, tax_office, billing_city, billing_district, postal_code, billing_email, e_invoice_registered, demo_started_at, demo_ends_at, converted_at, created_at";

export interface CrmRow {
  institution_id: string;
  institution_name: string;
  status: "DEMO" | "UCRETLI";
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string | null;
  tc_no: string | null;
  tax_no: string | null;
  billing_type: BillingType | null;
  legal_name: string | null;
  tax_office: string | null;
  billing_city: string | null;
  billing_district: string | null;
  postal_code: string | null;
  billing_email: string | null;
  e_invoice_registered: boolean | null;
  demo_started_at: string | null;
  demo_ends_at: string | null;
  converted_at: string | null;
  created_at: string;
}

/** Fatura profili (adres + kimlik + genişletilmiş alanlar); yalnız ADMIN'e verilir. */
export function toProfile(row: CrmRow): BillingProfile {
  return {
    address: row.address,
    tcNo: row.tc_no,
    taxNo: row.tax_no,
    billingType: row.billing_type,
    legalName: row.legal_name,
    taxOffice: row.tax_office,
    city: row.billing_city,
    district: row.billing_district,
    postalCode: row.postal_code,
    email: row.billing_email,
    eInvoiceRegistered: row.e_invoice_registered,
  };
}

function toCrmRecord(row: CrmRow): CrmRecord {
  return {
    status: row.status,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    demoStartedAt: row.demo_started_at,
    demoEndsAt: row.demo_ends_at,
    convertedAt: row.converted_at,
    billingComplete: isBillingComplete({ address: row.address, tcNo: row.tc_no, taxNo: row.tax_no }),
    billingProfileComplete: billingProfileCompleteness(toProfile(row)).complete,
  };
}

function toListItem(
  inst: EdorasInstitution | null,
  crm: CrmRow | null,
  licenseEndsOn: string | null,
  isInternal = false
): InstitutionListItem {
  if (inst) {
    return { ...inst, missingInEdoras: false, isInternal, crm: crm ? toCrmRecord(crm) : null, licenseEndsOn };
  }
  // Edoras'ta yok: yalnız CRM kaydından (kayıt anındaki ad).
  const row = crm as CrmRow;
  return {
    id: row.institution_id,
    name: row.institution_name,
    program: null,
    isActive: false,
    missingInEdoras: true,
    isInternal,
    createdAt: null,
    crm: toCrmRecord(row),
    licenseEndsOn,
  };
}

function latestEndByInstitution(rows: { institution_id: string; ends_on: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const current = map.get(r.institution_id);
    if (!current || r.ends_on > current) map.set(r.institution_id, r.ends_on);
  }
  return map;
}

// --- Okuma --------------------------------------------------------------------------------------

export async function listInstitutions(): Promise<InstitutionListItem[]> {
  const crmDb = getSupabaseAdminClient();
  const [institutions, crm, licenses, internal] = await Promise.all([
    listEdorasInstitutions(),
    fetchAll<CrmRow>((a, b) => crmDb.from("crm_institutions").select(CRM_COLUMNS).order("institution_id").range(a, b)),
    fetchAll<{ institution_id: string; ends_on: string }>((a, b) =>
      crmDb.from("crm_licenses").select("institution_id, ends_on").order("id").range(a, b)
    ),
    internalInstitutionIds(),
  ]);
  const crmById = new Map(crm.map((r) => [r.institution_id, r]));
  const licenseEnd = latestEndByInstitution(licenses);
  const items = institutions.map((inst) =>
    toListItem(inst, crmById.get(inst.id) ?? null, licenseEnd.get(inst.id) ?? null, internal.has(inst.id))
  );
  const known = new Set(institutions.map((i) => i.id));
  for (const row of crm) {
    if (!known.has(row.institution_id)) {
      items.push(toListItem(null, row, licenseEnd.get(row.institution_id) ?? null, internal.has(row.institution_id)));
    }
  }
  return items;
}

type LicenseRow = { id: string; starts_on: string; ends_on: string; price: number | string; note: string | null; created_at: string };
type PaymentRow = {
  id: string;
  license_id: string | null;
  amount: number | string;
  paid_on: string;
  method: PaymentMethod;
  note: string | null;
  created_at: string;
};

export async function getInstitutionDetail(id: string, staff: StaffContext): Promise<InstitutionDetail> {
  const crmDb = getSupabaseAdminClient();
  const financial = staff.role === "ADMIN";

  const [inst, crm, licenses, payments, internal] = await Promise.all([
    getEdorasInstitution(id),
    crmDb.from("crm_institutions").select(CRM_COLUMNS).eq("institution_id", id).maybeSingle(),
    crmDb
      .from("crm_licenses")
      .select("id, starts_on, ends_on, price, note, created_at")
      .eq("institution_id", id)
      .order("starts_on", { ascending: false }),
    financial
      ? crmDb
          .from("crm_payments")
          .select("id, license_id, amount, paid_on, method, note, created_at")
          .eq("institution_id", id)
          .order("paid_on", { ascending: false })
      : Promise.resolve({ data: null, error: null }),
    internalInstitutionIds(),
  ]);
  for (const r of [crm, licenses, payments]) if (r.error) throw dbError(r.error);
  const crmRow = (crm.data as CrmRow | null) ?? null;
  if (!inst && !crmRow) throw new HttpError(404, "NOT_FOUND");

  const extras = inst ? await getEdorasInstitutionExtras(id) : { admins: [], usage: { students: 0, teachers: 0, classes: 0 } };

  const licenseList: License[] = ((licenses.data ?? []) as LicenseRow[]).map((l) => ({
    id: l.id,
    startsOn: l.starts_on,
    endsOn: l.ends_on,
    price: financial ? Number(l.price) : null,
    note: l.note,
    createdAt: l.created_at,
  }));
  const paymentList: Payment[] | null = payments.data
    ? (payments.data as PaymentRow[]).map((p) => ({
        id: p.id,
        licenseId: p.license_id,
        amount: Number(p.amount),
        paidOn: p.paid_on,
        method: p.method,
        note: p.note,
        createdAt: p.created_at,
      }))
    : null;

  const latestEnd = licenseList.reduce<string | null>((max, l) => (!max || l.endsOn > max ? l.endsOn : max), null);
  return {
    ...toListItem(inst, crmRow, latestEnd, internal.has(id)),
    billing: financial && crmRow ? toProfile(crmRow) : null,
    licenses: licenseList,
    payments: paymentList,
    ...extras,
  };
}

// --- Yazma --------------------------------------------------------------------------------------

function enrollParams(
  institutionId: string,
  institutionName: string,
  input: Pick<EnrollInput, "status" | "contactName" | "contactPhone" | "contactEmail"> & Partial<EnrollInput>,
  staff: StaffContext
) {
  const contact = toContact(input);
  const paid = input.status === "UCRETLI";
  const billing = paid ? toBilling(input as EnrollInput) : { address: null, tcNo: null, taxNo: null };
  const license = paid ? toLicense(input as EnrollInput) : null;
  return {
    p_institution_id: institutionId,
    p_institution_name: institutionName,
    p_status: input.status,
    p_contact_name: contact.contactName,
    p_contact_phone: contact.contactPhone,
    p_contact_email: contact.contactEmail,
    p_address: billing.address,
    p_tc_no: billing.tcNo,
    p_tax_no: billing.taxNo,
    p_demo_starts_on: paid ? null : (input.demoStartsOn ?? null),
    p_license_starts_on: license?.startsOn ?? null,
    p_license_price: license?.price ?? null,
    p_created_by: staff.userId,
  };
}

/**
 * Demo kurum açar. Sıra: (Edoras) kurum → aktif yıl/dönem → kurum yöneticisi → üyelik, sonra (CRM)
 * DEMO kaydı (bugünden 1 yıl). İki veritabanı arasında transaction olmadığından her adım geri alma
 * işini kaydeder; CRM kaydı dahil herhangi bir adım patlarsa Edoras'ta açılanların hepsi silinir.
 * Geçici şifre yalnız bu yanıtta döner, hiçbir yerde saklanmaz.
 *
 * `afterEnroll`: CRM kaydından sonra aynı geri alma zincirinde çalışan ek adım (ör. adayı yeni kuruma
 * bağlamak — lib/server/crm-leads.ts). Patlarsa CRM kaydı ve Edoras'ta açılanlar da geri alınır.
 */
export async function createDemoInstitution(
  input: NewDemoInput,
  staff: StaffContext,
  options: {
    afterEnroll?: (institutionId: string) => Promise<void>;
    /** İşlem kaydı eylemi: satışla açılan hesapta PAID_ACCOUNT_CREATED (crm_record_lead_sale ücretliye geçirir). */
    auditAction?: "DEMO_CREATED" | "PAID_ACCOUNT_CREATED";
  } = {}
): Promise<DemoCredentials> {
  const contact = toContact(input);
  const name = input.institutionName.trim().replace(/\s+/g, " ");

  if (await isEdorasInstitutionNameTaken(name)) throw new HttpError(409, "INSTITUTION_NAME_TAKEN");
  if (await isEdorasEmailTaken(contact.contactEmail)) throw new HttpError(409, "EMAIL_TAKEN");

  const today = todayIso();
  const password = generateTemporaryPassword((max) => randomInt(max));
  const compensator = createCompensator();
  try {
    const { institutionId } = await createEdorasDemo(
      {
        institutionName: name,
        program: input.program,
        adminName: contact.contactName,
        adminEmail: contact.contactEmail,
        password,
        period: initialAcademicPeriod(today),
      },
      compensator
    );

    const crmDb = getSupabaseAdminClient();
    const { error } = await crmDb.rpc(
      "crm_enroll_institution",
      enrollParams(institutionId, name, { ...input, status: "DEMO", demoStartsOn: today }, staff)
    );
    if (error) throw dbError(error);
    // Yeni demonun lisansı/ödemesi yok: sonraki bir adım patlarsa CRM kaydı da silinebilir.
    compensator.push("crm:enroll", async () => {
      const { error: undoError } = await crmDb.from("crm_institutions").delete().eq("institution_id", institutionId);
      if (undoError) throw undoError;
    });

    if (options.afterEnroll) await options.afterEnroll(institutionId);

    const { data: crm } = await crmDb.from("crm_institutions").select("demo_ends_at").eq("institution_id", institutionId).maybeSingle();
    await recordAudit(staff, {
      action: options.auditAction ?? "DEMO_CREATED",
      entityType: "institution",
      entityId: institutionId,
      entityLabel: name,
      details: { program: input.program, demoEndsAt: (crm?.demo_ends_at as string | undefined) ?? null },
    });
    return {
      institutionId,
      loginEmail: contact.contactEmail,
      temporaryPassword: password,
      demoEndsAt: (crm?.demo_ends_at as string | undefined) ?? "",
      panelUrl: EDORAS_PANEL_URL,
    };
  } catch (err) {
    const failed = await compensator.rollback();
    if (failed.length) console.error(`[api] demo geri alınamadı, elle temizlenmeli: ${failed.join(", ")}`);
    throw err;
  }
}

/** CRM öncesinden kalan kurumu kayda alır: DEMO (başlangıç + 1 yıl) ya da — yalnız ADMIN — UCRETLI. */
export async function enrollInstitution(id: string, input: EnrollInput, staff: StaffContext): Promise<void> {
  if (input.status === "UCRETLI" && staff.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN");
  const inst = await getEdorasInstitution(id);
  if (!inst) throw new HttpError(404, "NOT_FOUND");
  const { error } = await getSupabaseAdminClient().rpc("crm_enroll_institution", enrollParams(id, inst.name, input, staff));
  if (error) throw dbError(error);
  await recordAudit(staff, {
    action: "INSTITUTION_ENROLLED",
    entityType: "institution",
    entityId: id,
    entityLabel: inst.name,
    details: { status: input.status },
  });
}

/** Demo → ücretli: fatura bilgisi + 1 yıllık lisans (+ isteğe bağlı ilk ödeme), tek transaction. */
export async function convertToPaid(id: string, input: ConvertInput, staff: StaffContext): Promise<void> {
  const billing = toBilling(input);
  const license = toLicense(input);
  const payment = input.withPayment ? toPayment(input) : null;
  const { error } = await getSupabaseAdminClient().rpc("crm_convert_to_paid", {
    p_institution_id: id,
    p_address: billing.address,
    p_tc_no: billing.tcNo,
    p_tax_no: billing.taxNo,
    p_license_starts_on: license.startsOn,
    p_license_price: license.price,
    p_payment_amount: payment?.amount ?? null,
    p_payment_method: payment?.method ?? null,
    p_paid_on: payment?.paidOn ?? null,
    p_created_by: staff.userId,
  });
  if (error) throw dbError(error);
  await recordAudit(staff, {
    action: "CONVERTED_TO_PAID",
    entityType: "institution",
    entityId: id,
    details: { licenseStartsOn: license.startsOn, price: license.price, firstPayment: payment?.amount ?? null },
  });
}

export async function renewLicense(id: string, price: number, staff: StaffContext): Promise<void> {
  const { error } = await getSupabaseAdminClient().rpc("crm_renew_license", {
    p_institution_id: id,
    p_price: price,
    p_created_by: staff.userId,
  });
  if (error) throw dbError(error);
  await recordAudit(staff, { action: "LICENSE_RENEWED", entityType: "institution", entityId: id, details: { price } });
}

export async function updateContact(id: string, input: ContactInput, staff: StaffContext): Promise<void> {
  const contact = toContact(input);
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_institutions")
    .update({
      contact_name: contact.contactName,
      contact_phone: contact.contactPhone,
      contact_email: contact.contactEmail,
    })
    .eq("institution_id", id)
    .select("institution_id");
  if (error) throw dbError(error);
  if (!data?.length) throw new HttpError(404, "NOT_ENROLLED");
  await recordAudit(staff, { action: "CONTACT_UPDATED", entityType: "institution", entityId: id });
}

/** Fatura profili (GET /api/institutions/{id}/billing) — yalnız ADMIN çağırır. Kayıt yoksa 404 NOT_ENROLLED. */
export async function getBilling(id: string): Promise<BillingProfile> {
  const { data, error } = await getSupabaseAdminClient().from("crm_institutions").select(CRM_COLUMNS).eq("institution_id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_ENROLLED");
  return toProfile(data as CrmRow);
}

/**
 * Fatura profilini yazar (adres + kimlik + unvan / il / ilçe / e-posta / vergi dairesi). Tür kimlikten türetilir;
 * `e_invoice_registered` panelden yazılmaz. Sonuç güncel profildir.
 */
export async function updateBilling(id: string, input: BillingInput, staff: StaffContext): Promise<BillingProfile> {
  const billing = toBillingProfile(input);
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_institutions")
    .update({
      address: billing.address,
      tc_no: billing.tcNo,
      tax_no: billing.taxNo,
      billing_type: billing.billingType,
      legal_name: billing.legalName,
      tax_office: billing.taxOffice,
      billing_city: billing.city,
      billing_district: billing.district,
      postal_code: billing.postalCode,
      billing_email: billing.email,
    })
    .eq("institution_id", id)
    .select(CRM_COLUMNS);
  if (error) throw dbError(error);
  if (!data?.length) throw new HttpError(404, "NOT_ENROLLED");
  // Değerler (adres, TC/VKN, unvan, e-posta) kayda yazılmaz; yalnız fatura türü.
  await recordAudit(staff, {
    action: "BILLING_UPDATED",
    entityType: "institution",
    entityId: id,
    details: { billingType: billing.billingType },
  });
  return toProfile(data[0] as unknown as CrmRow);
}

/**
 * Ödeme kaydı. Fatura bilgisi yoksa veritabanı reddeder (CRM_BILLING_REQUIRED).
 * `context.leadId`: ödeme CRM adayının "Tahsilat ekle" penceresinden geldiyse işlem kaydına yazılır.
 */
export async function recordPayment(
  id: string,
  input: PaymentInput,
  staff: StaffContext,
  context: { leadId?: string } = {}
): Promise<void> {
  const payment = toPayment(input);
  const { error } = await getSupabaseAdminClient()
    .from("crm_payments")
    .insert({
      institution_id: id,
      license_id: input.licenseId || null,
      amount: payment.amount,
      paid_on: payment.paidOn,
      method: payment.method,
      note: input.note.trim() || null,
      created_by: staff.userId,
    });
  if (error) {
    // Kurumun CRM kaydı yoksa FK hatası gelir.
    if (error.code === "23503" && /crm_payments_institution_id_fkey/.test(error.message)) {
      throw new HttpError(404, "NOT_ENROLLED");
    }
    throw dbError(error);
  }
  await recordAudit(staff, {
    action: "PAYMENT_RECORDED",
    entityType: "institution",
    entityId: id,
    details: { amount: payment.amount, method: payment.method, paidOn: payment.paidOn, ...(context.leadId ? { leadId: context.leadId } : {}) },
  });
}
