import { ok, requireStaff, route } from "@/lib/api/server";
import { institutionEventsQuerySchema } from "@/lib/domain/activity/events";
import { getInstitutionEvents } from "@/lib/server/activity";

export const dynamic = "force-dynamic";

/**
 * Aktivite geçmişi → Kurum etkinliği: Edoras kurum olaylarının birleşik, sayfalı zaman çizelgesi (salt okunur).
 * Süzgeç: institutionId, types (virgülle), from, to (en çok 90 gün; varsayılan son 7 gün), page, size. Yalnız ADMIN.
 */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await getInstitutionEvents(institutionEventsQuerySchema.parse(params)));
});
