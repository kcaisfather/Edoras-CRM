import { ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { getInstitutionDetail } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Kurum ayrıntısı. CRM_AGENT için fatura bilgisi, ödemeler ve lisans bedelleri sunucuda boşaltılır. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await getInstitutionDetail(id, staff));
});
