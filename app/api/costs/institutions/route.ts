import { ok, requireStaff, route } from "@/lib/api/server";
import { monthOfDay } from "@/lib/domain/costs/months";
import { monthQuerySchema } from "@/lib/domain/costs/schemas";
import { todayIso } from "@/lib/domain/institutions/rules";
import { getInstitutionCosts } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/**
 * Kurum başına maliyet ve marj (?month=YYYY-MM): ortak maliyet aktif öğrenciyle + kurumun SMS'i, lisans gelirine karşı.
 * Lisans bedeli içerir → yalnız ADMIN.
 */
export const GET = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const { month } = monthQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await getInstitutionCosts(staff, month ?? monthOfDay(todayIso())));
});
