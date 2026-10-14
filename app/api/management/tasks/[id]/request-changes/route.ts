import { ok, parseBody, requireIntId, requireStaff, route } from "@/lib/api/server";
import { kcaRequestChangesSchema } from "@/lib/domain/kca/types";
import { kcaRequestTaskChanges } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** "Düzeltme iste": Onay bekliyor → Devam ediyor + zorunlu not (görev girme yetkisi). → görev ayrıntısı. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireIntId((await params).id);
  return ok(await kcaRequestTaskChanges(staff, id, (await parseBody(request, kcaRequestChangesSchema)).note));
});
