import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { StaffContext } from "@/lib/api/server";
import { todayIso } from "@/lib/domain/institutions/rules";
import { institutionStatus } from "@/lib/domain/institutions/status";
import type { GrowthCustomer, GrowthCustomersResponse, GrowthLicense, GrowthPayment, WeeklyActivityResponse } from "@/lib/domain/growth/types";
import { fetchAll, listEdorasInstitutions } from "./edoras";
import { getInstitutionsUsage, getWeeklyActivity } from "./edoras-usage";
import { internalInstitutionIds } from "./internal-institutions";
import { listInstitutions } from "./institutions";

/**
 * Müşteri analizleri servisi: Edoras kurumları (+ CRM kaydı, lisans, ödeme) ile Edoras kullanım sinyallerini birleştirir.
 * Metriklerden hariç: iç / sunum kurumları (crm_internal_institutions) ve Edoras'ta bulunmayan (silinmiş) kurumlar.
 * Finansal alanlar (lisans bedeli, ödemeler) yalnız ADMIN'e gider — CRM_AGENT için sunucuda boşaltılır (`free` bilgisi kalır).
 */

interface LicenseRow {
  institution_id: string;
  starts_on: string;
  ends_on: string;
  price: number | string;
}
interface PaymentRow {
  institution_id: string;
  amount: number | string;
  paid_on: string;
}

function group<T extends { institution_id: string }, V>(rows: T[], map: (row: T) => V): Map<string, V[]> {
  const out = new Map<string, V[]>();
  for (const r of rows) {
    const list = out.get(r.institution_id);
    if (list) list.push(map(r));
    else out.set(r.institution_id, [map(r)]);
  }
  return out;
}

export async function listGrowthCustomers(staff: StaffContext, windowDays: number): Promise<GrowthCustomersResponse> {
  const financial = staff.role === "ADMIN";
  const crmDb = getSupabaseAdminClient();
  const today = todayIso();

  const [items, licenseRows, paymentRows] = await Promise.all([
    listInstitutions(),
    fetchAll<LicenseRow>((a, b) => crmDb.from("crm_licenses").select("institution_id, starts_on, ends_on, price").order("id").range(a, b)),
    financial
      ? fetchAll<PaymentRow>((a, b) => crmDb.from("crm_payments").select("institution_id, amount, paid_on").order("id").range(a, b))
      : Promise.resolve<PaymentRow[]>([]),
  ]);

  const customersSrc = items.filter((i) => !i.missingInEdoras && !i.isInternal);
  const usage = await getInstitutionsUsage(
    customersSrc.map((i) => i.id),
    windowDays
  );

  const licenses = group<LicenseRow, GrowthLicense>(licenseRows, (l) => ({
    startsOn: l.starts_on,
    endsOn: l.ends_on,
    price: financial ? Number(l.price) : null,
    free: Number(l.price) === 0,
  }));
  const payments = group<PaymentRow, GrowthPayment>(paymentRows, (p) => ({ amount: Number(p.amount), paidOn: p.paid_on }));

  const customers: GrowthCustomer[] = customersSrc.map((i) => ({
    id: i.id,
    name: i.name,
    program: i.program,
    isActive: i.isActive,
    createdAt: i.createdAt,
    status: i.crm?.status ?? null,
    state: institutionStatus(i, today).state,
    demoEndsAt: i.crm?.demoEndsAt ?? null,
    licenseEndsOn: i.licenseEndsOn,
    contactName: i.crm?.contactName ?? null,
    contactPhone: i.crm?.contactPhone ?? null,
    contactEmail: i.crm?.contactEmail ?? null,
    licenses: licenses.get(i.id) ?? [],
    payments: financial ? (payments.get(i.id) ?? []) : null,
    usage: usage.get(i.id) ?? null,
  }));
  customers.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  return { windowDays, generatedAt: new Date().toISOString(), customers };
}

export async function getGrowthWeekly(weeks: number): Promise<WeeklyActivityResponse> {
  const [institutions, internal] = await Promise.all([listEdorasInstitutions(), internalInstitutionIds()]);
  const ids = institutions.filter((i) => !internal.has(i.id)).map((i) => i.id);
  const result = await getWeeklyActivity(ids, weeks);
  return { ...result, generatedAt: new Date().toISOString() };
}
