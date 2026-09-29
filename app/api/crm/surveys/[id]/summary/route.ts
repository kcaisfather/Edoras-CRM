import { ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { surveySummary } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Özet: gönderilen davet, yanıt, yanıt oranı, NPS, destekçi / pasif / eleştirmen, memnuniyet ortalaması. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await surveySummary(id));
});
