import { ok, requireStaff, route } from "@/lib/api/server";
import { listSurveys } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

/** Anketler (varsayılan önce) + e-posta gönderimi açık mı → { surveys, mailEnabled }. Her CRM kullanıcısı. */
export const GET = route(async () => {
  await requireStaff();
  return ok(await listSurveys());
});
