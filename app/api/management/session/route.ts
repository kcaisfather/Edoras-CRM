import { ok, requireStaff, route } from "@/lib/api/server";
import { kcaSession } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

/**
 * Yönetim (KCA Panel) oturumu — her CRM personeli: KCA Panel hesap bağı durumu ve (bağlıysa) kişinin gördüğü Edoras
 * projeleri, üyeler. Bağ yoksa 200 + `NOT_LINKED` (ekran bağlama formunu gösterir).
 */
export const GET = route(async () => {
  const staff = await requireStaff();
  return ok(await kcaSession(staff));
});
