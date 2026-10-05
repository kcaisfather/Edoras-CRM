import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { paymentEditSchema } from "@/lib/domain/institutions/schemas";
import { deletePayment, updatePayment } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

/** Ödeme düzelt (tutar, tarih, yöntem, lisans, not). Faturası kesilmişse 409 SALE_INVOICED. Yalnız ADMIN. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const { id, paymentId } = await params;
  await updatePayment(requireUuid(id), requireUuid(paymentId), await parseBody(request, paymentEditSchema), staff);
  return ok({ ok: true });
});

/** Yanlış girilmiş ödemeyi sil. Faturası olan ödeme silinmez. Yalnız ADMIN. */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  assertSameOrigin(request);
  const { id, paymentId } = await params;
  await deletePayment(requireUuid(id), requireUuid(paymentId), staff);
  return ok({ ok: true });
});
