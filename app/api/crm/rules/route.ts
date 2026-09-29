import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { rulesSchema } from "@/lib/domain/tasks/schemas";
import { getRules, saveRules } from "@/lib/server/crm-rules";

export const dynamic = "force-dynamic";

/** Takip kuralları (her CRM kullanıcısı okur: Görevlerim ve aday formu). */
export const GET = route(async () => {
  await requireStaff();
  return ok(await getRules());
});

/** Kuralları kaydet — yalnız ADMIN (CRM_AGENT 403). Gövde: [{ id, enabled, days }]. */
export const PUT = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await saveRules(await parseBody(request, rulesSchema), staff));
});
