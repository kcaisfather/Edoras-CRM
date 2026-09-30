import { ok, requireStaff, route } from "@/lib/api/server";
import { DEFAULT_WEEKS, MAX_WEEKS } from "@/lib/domain/growth/weekly";
import { getGrowthWeekly } from "@/lib/server/growth";

export const dynamic = "force-dynamic";

/** Haftalık etkinlik serisi (kurum × hafta). Ağır sorgu: yalnız "Haftalık büyüme" bölümü açılınca çağrılır. Tutar içermez. */
export const GET = route(async (request: Request) => {
  await requireStaff();
  const raw = Number(new URL(request.url).searchParams.get("weeks"));
  const weeks = Number.isInteger(raw) && raw >= 4 && raw <= MAX_WEEKS ? raw : DEFAULT_WEEKS;
  return ok(await getGrowthWeekly(weeks));
});
