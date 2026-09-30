import { ok, parseBoundedBody, requireStaff, route } from "@/lib/api/server";
import { costImportSchema } from "@/lib/domain/costs/schemas";
import { importCostEntries } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/** Toplu maliyet satırı (CSV / Excel içe aktarma; en çok 500 satır, 512 KB). Satırlar ayrıca doğrulanır, tekrarlar atlanır. Yalnız ADMIN. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const body = await parseBoundedBody(request, costImportSchema, 512 * 1024);
  return ok(await importCostEntries(body.rows, staff));
});
