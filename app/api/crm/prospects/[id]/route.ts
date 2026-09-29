import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { prospectPatchSchema } from "@/lib/domain/cold-lists/schemas";
import { deleteProspect, updateProspect } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Kısmi güncelleme (her CRM kullanıcısı): arama sonucu ve alanlar. Sonucun anı sunucuda yazılır; telefon / e-posta
 * ham değerden sunucuda normalleştirilir. Görevlerim'deki soğuk liste görevi bu uçla kapanır ya da ileri kayar.
 */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await updateProspect(id, await parseBody(request, prospectPatchSchema), staff));
});

/** Kişiyi listeden siler (her CRM kullanıcısı — DeepSport ile aynı; tek kişi, CRM adayı etkilenmez). */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  await deleteProspect(id, staff);
  return ok({ ok: true });
});
