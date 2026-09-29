import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { prospectConvertSchema } from "@/lib/domain/cold-lists/schemas";
import { convertProspect } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Sıcağa taşı" (her CRM kullanıcısı) — tek transaction: CRM adayı (kaynak COLD_LIST, statü Aranacak / Takipte /
 * Randevu planlandı) + isteğe bağlı not + kişinin taşındı işareti. Adayı duran kişi → 409 PROSPECT_ALREADY_MOVED.
 * → { crmLeadId, prospect }
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await convertProspect(id, await parseBody(request, prospectConvertSchema), staff), 201);
});
