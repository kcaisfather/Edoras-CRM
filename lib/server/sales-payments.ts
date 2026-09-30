import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/api/server";
import type { PaymentMethod } from "@/lib/domain/institutions/types";
import type { PaymentListQuery } from "@/lib/domain/invoices/schemas";
import type { InvoiceStatus, SalePayment, SalePaymentList } from "@/lib/domain/invoices/types";
import { fetchAll } from "./edoras";
import { pgChain, type PgChain } from "./pg-chain";
import { staffNameMap } from "./staff";

/**
 * Ödeme Geçmişi (DeepSport /log-products karşılığı): TÜM kurumların crm_payments kayıtları, süzgeç + sayfalama +
 * toplam. Yalnız ADMIN (uç denetler); CRM_AGENT'a tutar hiç gönderilmez. Kişisel veri yok: kurum adı, tutar, yöntem.
 */

const COLUMNS = "id, institution_id, license_id, amount, paid_on, method, note, created_by, created_at, crm_institutions!inner(institution_name)";

interface PaymentJoinRow {
  id: string;
  institution_id: string;
  license_id: string | null;
  amount: number | string;
  paid_on: string;
  method: PaymentMethod;
  note: string | null;
  created_by: string | null;
  created_at: string;
  crm_institutions: { institution_name: string } | { institution_name: string }[] | null;
}

const institutionName = (row: PaymentJoinRow): string => {
  const embedded = Array.isArray(row.crm_institutions) ? row.crm_institutions[0] : row.crm_institutions;
  return embedded?.institution_name ?? "—";
};

/** LIKE joker karakterleri (% _ \) aramada düz metin sayılır. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listSalePayments(query: PaymentListQuery): Promise<SalePaymentList> {
  const db = getSupabaseAdminClient();

  const scoped = (q: unknown): PgChain => {
    let out = pgChain(q);
    if (query.institutionId) out = out.eq("institution_id", query.institutionId);
    if (query.method) out = out.eq("method", query.method);
    if (query.from) out = out.gte("paid_on", query.from);
    if (query.to) out = out.lte("paid_on", query.to);
    if (query.query) out = out.ilike("crm_institutions.institution_name", `%${escapeLike(query.query)}%`);
    return out;
  };

  const from = query.page * query.size;
  const [page, amounts, names] = await Promise.all([
    scoped(db.from("crm_payments").select(COLUMNS, { count: "exact" }))
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + query.size - 1),
    fetchAll<{ amount: number | string }>((a, b) =>
      scoped(db.from("crm_payments").select("amount, crm_institutions!inner(institution_name)")).order("id").range(a, b) as unknown as PromiseLike<{
        data: { amount: number | string }[] | null;
        error: { code?: string; message?: string } | null;
      }>
    ),
    staffNameMap(),
  ]);
  if (page.error) throw dbError(page.error);

  const rows = (page.data ?? []) as unknown as PaymentJoinRow[];

  // Her ödemenin en son faturası (Ödeme Geçmişi'nde "Fatura: Gönderildi" rozeti).
  const invoiceByPayment = new Map<string, { id: string; status: InvoiceStatus }>();
  if (rows.length > 0) {
    const { data, error } = await db
      .from("crm_invoices")
      .select("id, payment_id, status, created_at")
      .in(
        "payment_id",
        rows.map((r) => r.id)
      )
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
    for (const inv of (data ?? []) as { id: string; payment_id: string; status: InvoiceStatus }[]) {
      if (!invoiceByPayment.has(inv.payment_id)) invoiceByPayment.set(inv.payment_id, { id: inv.id, status: inv.status });
    }
  }

  const items: SalePayment[] = rows.map((r) => ({
    id: r.id,
    institutionId: r.institution_id,
    institutionName: institutionName(r),
    licenseId: r.license_id,
    amount: Number(r.amount),
    paidOn: r.paid_on,
    method: r.method,
    note: r.note,
    createdAt: r.created_at,
    sellerName: r.created_by ? (names.get(r.created_by) ?? null) : null,
    invoice: invoiceByPayment.get(r.id) ?? null,
  }));

  return {
    items,
    total: page.count ?? 0,
    totalAmount: Math.round(amounts.reduce((sum, r) => sum + Number(r.amount), 0) * 100) / 100,
    page: query.page,
    size: query.size,
  };
}
