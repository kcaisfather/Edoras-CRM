import { ok, requireStaff, route } from "@/lib/api/server";
import { getCostOverview } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/** Maliyetler → Genel bakış: bu ay, ay sonu tahmini, geçen ay, hizmet payları, 12 aylık eğilim, aktif uyarı sayısı. Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await getCostOverview());
});
