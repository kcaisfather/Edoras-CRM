import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { costBudgetInputSchema } from "@/lib/domain/costs/schemas";
import { deleteBudget, updateBudget } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Bütçeyi güncelle (yalnız ADMIN). */
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await updateBudget(id, await parseBody(request, costBudgetInputSchema), staff));
});

/** Bütçeyi sil (yalnız ADMIN). */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff({ role: "ADMIN" });
  await deleteBudget(requireUuid((await params).id), staff);
  return ok({ ok: true });
});
