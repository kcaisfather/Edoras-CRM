import { HttpError, ok, requireStaff, route } from "@/lib/api/server";
import { isRealDate } from "@/lib/domain/crm/appointment";
import { daySpan } from "@/lib/domain/performance/aggregate";
import { defaultRange, getPerformance } from "@/lib/server/performance";

export const dynamic = "force-dynamic";

/** En uzun dönem (gün). */
const MAX_DAYS = 400;

/**
 * Satış Performansı: kişi başına dönem toplamları. `?from=&to=` (YYYY-MM-DD, İstanbul günü, uçlar dahil); verilmezse
 * son 30 gün. ADMIN herkesi ve tutarları görür; CRM_AGENT yalnız kendi satırını görür, tutarlar boş döner.
 */
export const GET = route(async (request: Request) => {
  const staff = await requireStaff();
  const p = new URL(request.url).searchParams;
  const from = p.get("from");
  const to = p.get("to");
  if ((from === null) !== (to === null)) throw new HttpError(400, "VALIDATION");
  if (from !== null && to !== null) {
    if (!isRealDate(from) || !isRealDate(to) || to < from || daySpan(from, to) > MAX_DAYS) throw new HttpError(400, "VALIDATION");
  }
  return ok(await getPerformance(from !== null && to !== null ? { from, to } : defaultRange(), staff));
});
