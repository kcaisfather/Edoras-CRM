import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { costEntryInputSchema } from "@/lib/domain/costs/schemas";
import { deleteCostEntry, updateCostEntry } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Maliyet satırını güncelle (yalnız ADMIN). */
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await updateCostEntry(id, await parseBody(request, costEntryInputSchema), staff));
});

/** Maliyet satırını sil (yalnız ADMIN). */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff({ role: "ADMIN" });
  await deleteCostEntry(requireUuid((await params).id), staff);
  return ok({ ok: true });
});
