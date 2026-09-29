import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { paymentSchema } from "@/lib/domain/institutions/schemas";
import { listLeadCollections, recordLeadCollection } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Adayın tahsilat geçmişi = bağlı kurumun ödemeleri (yalnız ADMIN; CRM_AGENT tutar görmez). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await listLeadCollections(id));
});

/**
 * Tahsilat ekle = bağlı kuruma ödeme (yalnız ADMIN). Aday bağlı değilse 409 LEAD_NOT_LINKED; kurum CRM'e
 * kayıtlı değilse 404 NOT_ENROLLED; fatura bilgisi eksikse 422 BILLING_REQUIRED (veritabanı da reddeder).
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await recordLeadCollection(id, await parseBody(request, paymentSchema), staff);
  return ok({ ok: true }, 201);
});
