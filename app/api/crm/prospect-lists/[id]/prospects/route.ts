import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { prospectCreateSchema } from "@/lib/domain/cold-lists/schemas";
import { createProspect } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Listeye tek kişiyi elle ekler ("Kişi ekle"; her CRM kullanıcısı). Telefon / e-posta ham gelir, normalize değeri
 * sunucu hesaplar (içe aktarmayla aynı). Aynı listede aynı telefon / e-posta → 409 PROSPECT_DUPLICATE.
 * → Prospect (201)
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await createProspect(id, await parseBody(request, prospectCreateSchema), staff), 201);
});
