import { assertSameOrigin, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { deleteProspectList } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Listeyi kişileriyle birlikte siler — YALNIZ ADMIN. Listeler ekipçe paylaşıldığı için (DeepSport'ta tarayıcıya
 * özeldi, herkes kendi listesini silebiliyordu) toplu silme yönetici işidir. Taşınan CRM adayları kalır.
 */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await deleteProspectList(id, staff);
  return ok({ ok: true });
});
