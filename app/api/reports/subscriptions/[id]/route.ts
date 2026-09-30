import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { reportSubscriptionInputSchema } from "@/lib/domain/reports/schemas";
import { deleteSubscription, updateSubscription } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Aboneliği güncelle (sonraki çalışma yeniden hesaplanır). Yalnız ADMIN. */
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await updateSubscription(id, await parseBody(request, reportSubscriptionInputSchema), staff));
});

/** Aboneliği sil (gönderim kayıtlarıyla birlikte). Yalnız ADMIN. */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff({ role: "ADMIN" });
  await deleteSubscription(requireUuid((await params).id), staff);
  return ok({ ok: true });
});
