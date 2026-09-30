import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { costEntriesQuerySchema, costEntryInputSchema } from "@/lib/domain/costs/schemas";
import { createCostEntry, listCostEntries } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/** Maliyet defteri satırları (?service, from, to (YYYY-MM), page, size; toplam TL süzgece uyan tüm satırların). Yalnız ADMIN. */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listCostEntries(costEntriesQuerySchema.parse(params)));
});

/** Elle maliyet satırı ekle (USD ise kur zorunlu). Yalnız ADMIN; işlem kaydına yazılır. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await createCostEntry(await parseBody(request, costEntryInputSchema), staff), 201);
});
