import { ok, parseBody, requireIntId, requireStaff, route } from "@/lib/api/server";
import { kcaApproveSchema } from "@/lib/domain/kca/types";
import { kcaApproveTask } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** "✓ OK": Onay bekliyor → Tamamlandı (görev girme yetkisi). İsteğe bağlı not. → görev ayrıntısı. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireIntId((await params).id);
  return ok(await kcaApproveTask(staff, id, (await parseBody(request, kcaApproveSchema)).note));
});
