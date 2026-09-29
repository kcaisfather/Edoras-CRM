import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { leadPatchSchema } from "@/lib/domain/crm/schemas";
import { deleteLead, updateLead } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Kısmi güncelleme (her CRM kullanıcısı). Statü gelirse takip alanları statü kurallarıyla yazılır. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await updateLead(id, await parseBody(request, leadPatchSchema), staff));
});

/** Adayı ve notlarını siler (bağlı kurumun kaydı, lisansı ve ödemeleri etkilenmez). */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  await deleteLead(id, staff);
  return ok({ ok: true });
});
