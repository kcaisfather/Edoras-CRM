import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { billingSchema } from "@/lib/domain/institutions/schemas";
import { getBilling, updateBilling } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Fatura profili (adres, TC/VKN, unvan, vergi dairesi, il/ilçe, e-posta…) — yalnız ADMIN (kişisel veri, CRM_AGENT görmez). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff({ role: "ADMIN" });
  return ok(await getBilling(requireUuid((await params).id)));
});

/** Fatura profilini yazar (yalnız ADMIN). Tür kimlikten türetilir: TC → bireysel, Vergi No → kurumsal (+ vergi dairesi). */
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await updateBilling(id, await parseBody(request, billingSchema), staff));
});

/** Eski ekranların kullandığı yöntem; PUT ile aynı. */
export const PATCH = PUT;
