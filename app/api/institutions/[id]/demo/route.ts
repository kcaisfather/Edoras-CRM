import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { demoEditSchema } from "@/lib/domain/institutions/schemas";
import { updateDemoEnd } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Açık demonun bitişini değiştir (uzat ya da kısalt; süre kurum bazlı). Yalnız ADMIN. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await updateDemoEnd(id, await parseBody(request, demoEditSchema), staff);
  return ok({ ok: true });
});
