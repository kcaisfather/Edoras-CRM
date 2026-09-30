import { ok, requireStaff, route } from "@/lib/api/server";
import { parseWindowDays } from "@/lib/domain/growth/usage";
import { listGrowthCustomers } from "@/lib/server/growth";

export const dynamic = "force-dynamic";

/**
 * Müşteri analizleri: her kurum için CRM durumu, lisanslar ve Edoras kullanım sinyalleri (?window=7|30|90 gün).
 * CRM_AGENT için lisans bedelleri ve ödemeler sunucuda boşaltılır. Kullanım okuması 5 dk önbellekli (lib/server/edoras-usage.ts).
 */
export const GET = route(async (request: Request) => {
  const staff = await requireStaff();
  const window = parseWindowDays(new URL(request.url).searchParams.get("window"));
  return ok(await listGrowthCustomers(staff, window));
});
