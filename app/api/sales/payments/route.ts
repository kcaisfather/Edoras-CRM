import { ok, requireStaff, route } from "@/lib/api/server";
import { paymentListQuerySchema } from "@/lib/domain/invoices/schemas";
import { listSalePayments } from "@/lib/server/sales-payments";

export const dynamic = "force-dynamic";

/**
 * Ödeme Geçmişi: tüm kurumların ödemeleri (DeepSport /log-products karşılığı). Süzgeç: from, to, method, institutionId,
 * query (kurum adı); sayfalama: page (0'dan), size (≤200); yanıtta süzgece uyan tüm kayıtların toplamı. Yalnız ADMIN
 * (finansal): CRM_AGENT 403.
 */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listSalePayments(paymentListQuerySchema.parse(params)));
});
