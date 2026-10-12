import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { leadToColdListSchema } from "@/lib/domain/cold-lists/schemas";
import { leadOriginListIds, returnLeadToColdList } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Adayın geldiği soğuk listeler ("Sıcağa taşı" ile açıldıysa) → { listIds } — geri gönderme penceresi önerir. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  return ok({ listIds: await leadOriginListIds(id) });
});

/**
 * "Soğuk listeye geri gönder" (her CRM kullanıcısı; "Sıcağa taşı"nın tersi). Aday silinmez: "Satış olmadı" olur
 * (kayıp nedeni zorunlu); kişi seçilen listeye "Aranmadı" olarak döner — adaydan gelen kişi o listedeyse "CRM'e
 * taşındı" işareti kaldırılır, yoksa yeni kişi eklenir. Müşteri → 409 LEAD_IS_CUSTOMER.
 * → { prospect, restored }
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await returnLeadToColdList(id, await parseBody(request, leadToColdListSchema), staff));
});
