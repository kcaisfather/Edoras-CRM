import { ok, requireStaff, route } from "@/lib/api/server";
import { getCostAlerts } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/** Hesaplanmış maliyet uyarıları (bütçe yumuşak / sert eşik, ay sonu aşım tahmini, aylık sıçrama). Saklanmaz. Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await getCostAlerts());
});
