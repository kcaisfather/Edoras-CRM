import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { leadMergeSchema } from "@/lib/domain/crm/schemas";
import { mergeLeads } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

/**
 * İki adayı birleştir (yalnız ADMIN): `dropId` silinir, notları / görevleri / randevuları / anketleri `keepId`'ye
 * taşınır, ana adayın boş alanları doldurulur. İkisi de farklı kuruma bağlıysa 409. → birleşen aday.
 */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await mergeLeads(await parseBody(request, leadMergeSchema), staff));
});
