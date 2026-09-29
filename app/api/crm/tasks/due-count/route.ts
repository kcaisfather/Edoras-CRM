import { ok, requireStaff, route } from "@/lib/api/server";
import { dueTaskCount } from "@/lib/server/crm-tasks";

export const dynamic = "force-dynamic";

/** Menü rozeti: çağıranın gördüğü gecikmiş + bugün açık görev sayısı. */
export const GET = route(async () => {
  const staff = await requireStaff();
  return ok({ count: await dueTaskCount(staff) });
});
