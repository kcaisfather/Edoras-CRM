import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { costBudgetInputSchema } from "@/lib/domain/costs/schemas";
import { createBudget, listBudgetStatuses } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/** Bütçeler ve içinde bulunulan aydaki durumları (okuma anında hesaplanır). Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await listBudgetStatuses());
});

/** Bütçe ekle (kapsam başına tek aktif bütçe). Yalnız ADMIN. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await createBudget(await parseBody(request, costBudgetInputSchema), staff), 201);
});
