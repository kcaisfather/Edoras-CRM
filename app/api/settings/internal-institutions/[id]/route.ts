import { assertSameOrigin, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { unmarkInternal } from "@/lib/server/internal-institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** İç kurum işaretini kaldır (yalnız ADMIN). */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const actor = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await unmarkInternal(id, actor);
  return ok({ ok: true });
});
