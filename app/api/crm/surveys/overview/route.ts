import { ok, requireStaff, route } from "@/lib/api/server";
import { npsOverview } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

/** Genel NPS özeti (tüm anketler): son 90 gün + aylık eğilim. Her CRM kullanıcısı; yalnız sayılar döner. */
export const GET = route(async () => {
  await requireStaff();
  return ok(await npsOverview());
});
