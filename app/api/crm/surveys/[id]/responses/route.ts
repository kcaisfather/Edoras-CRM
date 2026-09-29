import { HttpError, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { responseQuerySchema } from "@/lib/domain/surveys/schemas";
import { listResponses } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Yanıtlar, yeniden eskiye: `?page&size` → { items, page, size, total }. Puanı yalnız müşteri verir (yazma ucu yok). */
export const GET = route(async (request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  const sp = new URL(request.url).searchParams;
  const query = responseQuerySchema.safeParse({ page: sp.get("page") ?? undefined, size: sp.get("size") ?? undefined });
  if (!query.success) throw new HttpError(400, "VALIDATION");
  return ok(await listResponses(id, query.data));
});
