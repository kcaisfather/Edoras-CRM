import { assertSameOrigin, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { retryInvoice } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";
/** Platform faturası (Paraşüt) resmileştirme işini bekler: en çok ~30 sn. */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Başarısız faturayı yeniden dener (yalnız ADMIN; yalnız FAILED, elle kayıt değil → 409 INVOICE_NOT_RETRYABLE). */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  assertSameOrigin(request);
  const id = requireUuid((await params).id);
  return ok(await retryInvoice(id, staff));
});
