import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { billingSchema } from "@/lib/domain/institutions/schemas";
import { updateBilling } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Fatura bilgisi (adres + TC/VKN) — yalnız ADMIN (kişisel veri, CRM_AGENT görmez). */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await updateBilling(id, await parseBody(request, billingSchema));
  return ok({ ok: true });
});
