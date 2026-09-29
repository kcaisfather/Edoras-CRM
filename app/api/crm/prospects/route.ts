import { HttpError, ok, requireStaff, route } from "@/lib/api/server";
import { prospectQuerySchema } from "@/lib/domain/cold-lists/schemas";
import { listProspects } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

/** Listenin kişileri, ekleme sırasıyla: `?listId&page&size` (page 0 tabanlı, size ≤ 1000) → { items, page, size, total }. */
export const GET = route(async (request: Request) => {
  await requireStaff();
  const sp = new URL(request.url).searchParams;
  const query = prospectQuerySchema.safeParse({
    listId: sp.get("listId"),
    page: sp.get("page") ?? undefined,
    size: sp.get("size") ?? undefined,
  });
  if (!query.success) throw new HttpError(400, "VALIDATION");
  return ok(await listProspects(query.data));
});
