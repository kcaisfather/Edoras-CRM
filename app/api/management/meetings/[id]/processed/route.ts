import { ok, parseBody, requireIntId, requireStaff, route } from "@/lib/api/server";
import { kcaMeetingProcessedSchema } from "@/lib/domain/kca/types";
import { kcaSetMeetingProcessed } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** "İşlendi say" / "Yeniden aç" — yalnız sahibi. → not ayrıntısı. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireIntId((await params).id);
  const body = await parseBody(request, kcaMeetingProcessedSchema);
  return ok(await kcaSetMeetingProcessed(staff, id, body.done, body.result));
});
