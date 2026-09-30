import { HttpError, requireStaff, route } from "@/lib/api/server";
import { monthOfDay } from "@/lib/domain/costs/months";
import { monthQuerySchema } from "@/lib/domain/costs/schemas";
import { todayIso } from "@/lib/domain/institutions/rules";
import { COST_EXPORT_KINDS, buildCostExport, buildInstitutionCostExport, type CostExportKind } from "@/lib/server/costs";
import { toCsv } from "@/lib/utils/csv";

export const dynamic = "force-dynamic";

/**
 * Maliyet CSV dışa aktarma (?kind=entries|services|trend|institutions&month=YYYY-MM): Excel TR için ";" ayraç + UTF-8 BOM.
 * "institutions" lisans geliri içerir. Yalnız ADMIN.
 */
export const GET = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (!(COST_EXPORT_KINDS as readonly string[]).includes(kind ?? "")) throw new HttpError(400, "VALIDATION");
  const { month } = monthQuerySchema.parse({ month: params.get("month") ?? undefined });
  const resolved = month ?? monthOfDay(todayIso());
  const file = kind === "institutions" ? await buildInstitutionCostExport(staff, resolved) : await buildCostExport(kind as CostExportKind, resolved);
  return new Response("\uFEFF" + toCsv(file.header, file.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}-${todayIso()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
