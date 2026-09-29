import { ok, requireStaff, route } from "@/lib/api/server";
import { listAssignees } from "@/lib/server/crm-tasks";

export const dynamic = "force-dynamic";

/** "Atanan kişi" seçenekleri: ADMIN için aktif ekip, CRM_AGENT için yalnız kendisi. */
export const GET = route(async () => {
  const staff = await requireStaff();
  return ok(await listAssignees(staff));
});
