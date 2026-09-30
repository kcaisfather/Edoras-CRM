import { HttpError, ok, requireStaff, route } from "@/lib/api/server";
import { reportPreviewQuerySchema } from "@/lib/domain/reports/schemas";
import { previewReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/**
 * Rapor önizlemesi: ?sections=todayTasks,openOffers&frequency=WEEKLY. Çağıranın ROLÜNE göre üretilir — CRM_AGENT
 * tutar ve satış toplamını hiç görmez (aynı süzme e-postada da uygulanır). Kaynak veri sunucuda okunur.
 */
export const GET = route(async (request: Request) => {
  const staff = await requireStaff();
  const params = new URL(request.url).searchParams;
  const parsed = reportPreviewQuerySchema.safeParse({
    sections: params.get("sections") ?? undefined,
    frequency: params.get("frequency") ?? undefined,
  });
  if (!parsed.success) throw new HttpError(400, "VALIDATION");
  return ok(await previewReport(staff, parsed.data.sections, parsed.data.frequency));
});
